/**
 * Effect-style shared library for the Salesforce CLI subcommands and the
 * companion `bun run scripts/salesforce/*` wrappers.
 *
 * HTTP calls against the running Executor daemon are tagged-error-typed and
 * thread through `Effect`. Process side effects (spawning `sf`, reading env
 * vars, checking file existence) live behind narrow helpers so the test
 * harness in §I can stub them without touching `process` directly.
 */

import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Data, Effect } from "effect";

import {
  deprecatedDestructiveToolPolicyPatterns,
  destructiveToolPolicyPatterns,
  salesforceSourceRegistry,
  sourceById,
  type ExecutorMcpSourceConfig,
  type SalesforceSourceDefinition,
} from "@salesforce-executor/docs-index";

// ── Tagged errors ────────────────────────────────────────────────────────

/** HTTP request against the Executor daemon failed at the transport layer. */
export class ExecutorHttpError extends Data.TaggedError("ExecutorHttpError")<{
  readonly method: string;
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Executor daemon responded with a non-2xx status. */
export class ExecutorHttpStatusError extends Data.TaggedError("ExecutorHttpStatusError")<{
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: string;
}> {}

/** Caller did not provide a Salesforce org alias and none was found in env. */
export class MissingOrgAliasError extends Data.TaggedError("MissingOrgAliasError")<{
  readonly message: string;
}> {}

/** Caller asked for a registry source id that does not exist. */
export class UnknownSalesforceSourceError extends Data.TaggedError("UnknownSalesforceSourceError")<{
  readonly id: string;
}> {}

/** Caller asked for a profile other than core/data/full. */
export class UnknownSalesforceProfileError extends Data.TaggedError(
  "UnknownSalesforceProfileError",
)<{
  readonly profile: string;
}> {}

/** A registry entry that should have been an MCP source turned out not to be. */
export class NotAnMcpSourceError extends Data.TaggedError("NotAnMcpSourceError")<{
  readonly id: string;
}> {}

/** Source registry invariant tripped while running test-sources. */
export class RegistryInvariantError extends Data.TaggedError("RegistryInvariantError")<{
  readonly message: string;
}> {}

// ── Environment ──────────────────────────────────────────────────────────

const repoRootDefault = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

// All four env-derived values are exposed as getter functions so the test
// harness in `tests/setup-profile.test.ts` can mutate `process.env` between
// runs without restarting the module. The previous module-load eagerness
// pinned `executorUrl` to its first observed value, so a test that swapped
// `EXECUTOR_URL` after the import would still hit the real daemon URL.
export const repoRoot = (): string => process.env.SALESFORCE_EXECUTOR_ROOT ?? repoRootDefault;
export const executorUrl = (): string => process.env.EXECUTOR_URL ?? "http://localhost:4788";

export const data360PluginRoot = (): string => process.env.D360_CODEX_PLUGIN_ROOT ?? "";
export const data360McpJar = (): string =>
  process.env.D360_MCP_JAR ??
  (process.env.D360_MCP_REPO
    ? `${process.env.D360_MCP_REPO}/target/data360-mcp-server-1.0.0.jar`
    : "");

// ── CLI helpers ──────────────────────────────────────────────────────────

export type CliResult = {
  readonly command: string;
  readonly ok: boolean;
  readonly output: string;
};

const execOptions: ExecFileSyncOptionsWithStringEncoding = {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
};

/**
 * Run an external executable synchronously and return a structured result.
 *
 * Wrapped in `Effect.sync` so callers stay inside Effect; failures are
 * never thrown — they surface as `ok: false`. This is deliberate: doctor
 * needs to report missing executables as info, not as failed effects.
 */
export const runCli = (
  command: string,
  args: ReadonlyArray<string> = [],
): Effect.Effect<CliResult> =>
  Effect.sync(() => {
    try {
      const output = execFileSync(command, [...args], execOptions);
      return { command: [command, ...args].join(" "), ok: true, output: output.trim() };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { command: [command, ...args].join(" "), ok: false, output: message };
    }
  });

export const checkExecutable = (command: string, args: ReadonlyArray<string> = ["--version"]) =>
  runCli(command, args);

export const sfOrgDisplay = (alias: string): Effect.Effect<Record<string, unknown> | undefined> =>
  runCli("sf", ["org", "display", "-o", alias, "--json"]).pipe(
    Effect.map((result) => {
      if (!result.ok) return undefined;
      try {
        return (JSON.parse(result.output) as { result?: Record<string, unknown> }).result;
      } catch {
        return undefined;
      }
    }),
  );

// ── HTTP helpers ─────────────────────────────────────────────────────────

const defaultInit: RequestInit = {};

const doFetch = (path: string, init: RequestInit = defaultInit) =>
  Effect.tryPromise({
    try: () => fetch(`${executorUrl()}${path}`, init),
    catch: (cause) => new ExecutorHttpError({ method: init.method ?? "GET", path, cause }),
  });

const readResponseText = (res: Response): Effect.Effect<string> =>
  Effect.tryPromise({ try: () => res.text(), catch: () => "unreadable response body" }).pipe(
    Effect.orElseSucceed(() => ""),
  );

/**
 * GET/POST/DELETE against the Executor daemon and parse the response body
 * as JSON. Non-2xx responses surface as `ExecutorHttpStatusError` so callers
 * can distinguish "endpoint not reachable" from "endpoint refused request".
 */
export const requestJson = <T = unknown>(
  path: string,
  init: RequestInit = defaultInit,
): Effect.Effect<T, ExecutorHttpError | ExecutorHttpStatusError> =>
  Effect.gen(function* () {
    const method = init.method ?? "GET";
    const res = yield* doFetch(path, init);
    if (!res.ok) {
      const body = yield* readResponseText(res);
      return yield* new ExecutorHttpStatusError({ method, path, status: res.status, body });
    }
    return yield* Effect.tryPromise({
      try: () => res.json() as Promise<T>,
      catch: (cause) => new ExecutorHttpError({ method, path, cause }),
    });
  });

/** Same as `requestJson` but lets 404 fall through as `undefined`. */
const requestJsonOptional = <T>(
  path: string,
): Effect.Effect<T | undefined, ExecutorHttpError | ExecutorHttpStatusError> =>
  Effect.gen(function* () {
    const res = yield* doFetch(path);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const body = yield* readResponseText(res);
      return yield* new ExecutorHttpStatusError({ method: "GET", path, status: res.status, body });
    }
    const parsed = yield* Effect.tryPromise({
      try: () => res.json() as Promise<T | null>,
      catch: (cause) => new ExecutorHttpError({ method: "GET", path, cause }),
    });
    return parsed ?? undefined;
  });

export type ExecutorScope = { readonly id: string; readonly name?: string };

export const getScope = (): Effect.Effect<
  ExecutorScope,
  ExecutorHttpError | ExecutorHttpStatusError
> => requestJson<ExecutorScope>("/api/scope");

// ── Source registration ──────────────────────────────────────────────────

export const substituteEnvTokens = (value: string, orgAlias: string): string =>
  value
    .replaceAll("${SF_ORGS:-DEFAULT_TARGET_ORG}", process.env.SF_ORGS ?? orgAlias)
    .replaceAll("${D360_ORG_ALIAS}", process.env.D360_ORG_ALIAS ?? orgAlias)
    .replaceAll("${SALESFORCE_EXECUTOR_ROOT}", repoRoot())
    .replaceAll("${D360_CODEX_PLUGIN_ROOT}", data360PluginRoot());

export const normalizeMcpConfig = (
  config: ExecutorMcpSourceConfig,
  orgAlias: string,
): ExecutorMcpSourceConfig => {
  if (config.transport === "remote") return config;
  return {
    ...config,
    command: substituteEnvTokens(config.command, orgAlias),
    args: config.args?.map((arg) => substituteEnvTokens(arg, orgAlias)),
    cwd: config.cwd ? substituteEnvTokens(config.cwd, orgAlias) : undefined,
    env: config.env
      ? Object.fromEntries(
          Object.entries(config.env).map(([key, value]) => [
            key,
            substituteEnvTokens(value, orgAlias),
          ]),
        )
      : undefined,
  };
};

type StoredMcpSourceConfig = {
  readonly transport?: string;
  readonly command?: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly endpoint?: string;
  readonly remoteTransport?: string;
  readonly auth?: unknown;
  readonly headers?: unknown;
  readonly queryParams?: unknown;
};

type StoredMcpSource = {
  readonly id?: string;
  readonly namespace?: string;
  readonly name?: string;
  readonly toolCount?: number;
  readonly config?: StoredMcpSourceConfig;
};

const fetchExistingSource = (scopeId: string, namespace: string) =>
  requestJsonOptional<StoredMcpSource>(`/api/scopes/${scopeId}/mcp/sources/${namespace}`);

const isSameMcpConfig = (
  existing: StoredMcpSource | undefined,
  payload: ExecutorMcpSourceConfig,
): boolean => {
  if (!existing?.config) return false;
  const config = existing.config;
  if (config.transport !== payload.transport) return false;
  if (payload.transport === "remote") {
    return (
      config.endpoint === payload.endpoint &&
      (config.remoteTransport ?? "auto") === (payload.remoteTransport ?? "auto") &&
      JSON.stringify(config.auth ?? { kind: "none" }) ===
        JSON.stringify(payload.auth ?? { kind: "none" })
    );
  }
  const sameArgs = JSON.stringify(config.args ?? []) === JSON.stringify(payload.args ?? []);
  const sameEnv = JSON.stringify(config.env ?? {}) === JSON.stringify(payload.env ?? {});
  return (
    config.command === payload.command &&
    (config.cwd ?? undefined) === (payload.cwd ?? undefined) &&
    sameArgs &&
    sameEnv
  );
};

export type RegisterMcpResult = {
  readonly namespace: string;
  readonly toolCount: number;
  readonly status: "added" | "unchanged" | "updated";
};

export const registerMcpSource = (
  scopeId: string,
  source: SalesforceSourceDefinition,
  orgAlias: string,
): Effect.Effect<
  RegisterMcpResult,
  ExecutorHttpError | ExecutorHttpStatusError | NotAnMcpSourceError
> =>
  Effect.gen(function* () {
    if (!source.executorSourceConfig || "kind" in source.executorSourceConfig) {
      return yield* new NotAnMcpSourceError({ id: source.id });
    }
    const payload = normalizeMcpConfig(source.executorSourceConfig, orgAlias);
    const existing = yield* fetchExistingSource(scopeId, payload.namespace);

    if (existing && isSameMcpConfig(existing, payload)) {
      return {
        namespace: payload.namespace,
        toolCount: typeof existing.toolCount === "number" ? existing.toolCount : 0,
        status: "unchanged" as const,
      };
    }

    if (existing) {
      yield* requestJson<unknown>(`/api/scopes/${scopeId}/mcp/sources/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ namespace: payload.namespace }),
      });
    }

    const addRequest: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetScope: scopeId, ...payload }),
    };

    const added = yield* requestJson<{ namespace: string; toolCount: number }>(
      `/api/scopes/${scopeId}/mcp/sources`,
      addRequest,
    ).pipe(
      // Remote transports can race: the daemon registers the source and then
      // our follow-up GET sees the persisted shape even when the POST returned
      // an error. Treat that as success.
      Effect.catch((error) => {
        if (payload.transport !== "remote") return Effect.fail(error);
        return fetchExistingSource(scopeId, payload.namespace).pipe(
          Effect.flatMap((persisted) =>
            persisted && isSameMcpConfig(persisted, payload)
              ? Effect.succeed({
                  namespace: payload.namespace,
                  toolCount: typeof persisted.toolCount === "number" ? persisted.toolCount : 0,
                })
              : Effect.fail(error),
          ),
          Effect.catch(() => Effect.fail(error)),
        );
      }),
    );

    return { ...added, status: existing ? ("updated" as const) : ("added" as const) };
  });

export const registerPolicyDefaults = (
  scopeId: string,
): Effect.Effect<void, ExecutorHttpError | ExecutorHttpStatusError> =>
  Effect.gen(function* () {
    const existing = yield* requestJson<
      ReadonlyArray<{ readonly id: string; readonly pattern: string; readonly action: string }>
    >(`/api/scopes/${scopeId}/policies`);

    const deprecated = new Set<string>(deprecatedDestructiveToolPolicyPatterns);
    for (const policy of existing) {
      if (!deprecated.has(policy.pattern)) continue;
      yield* requestJson(`/api/scopes/${scopeId}/policies/${policy.id}`, {
        method: "DELETE",
      }).pipe(Effect.ignore);
    }

    const active = existing.filter((policy) => !deprecated.has(policy.pattern));
    const existingKeys = new Set(active.map((policy) => `${policy.pattern}:${policy.action}`));
    for (const pattern of destructiveToolPolicyPatterns) {
      const key = `${pattern}:require_approval`;
      if (existingKeys.has(key)) continue;
      yield* requestJson(`/api/scopes/${scopeId}/policies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetScope: scopeId, pattern, action: "require_approval" }),
      });
    }
  });

// ── Profiles ─────────────────────────────────────────────────────────────

export type SalesforceProfile = "core" | "data" | "full";

/**
 * Each profile lists registry ids that the profile *intends* to register.
 * Docs-only entries (e.g. `salesforce-hosted-mcp`) are listed here for
 * surface documentation but skipped at registration time with a clear notice
 * in `registrySelection`.
 */
export const profileSourceIds: Readonly<Record<SalesforceProfile, ReadonlyArray<string>>> = {
  core: ["salesforce-dx-mcp", "salesforce-hosted-mcp", "salesforce-family-cli-bridge"],
  data: ["salesforce-dx-mcp", "data360-mcp", "data360-hosted-mcp", "salesforce-family-cli-bridge"],
  full: salesforceSourceRegistry
    .filter((source) => Boolean(source.executorSourceConfig))
    .map((source) => source.id),
};

export const isSalesforceProfile = (value: string): value is SalesforceProfile =>
  value === "core" || value === "data" || value === "full";

export type RegistrySelectionEntry =
  | { readonly kind: "include"; readonly source: SalesforceSourceDefinition }
  | { readonly kind: "docs-only"; readonly id: string; readonly profile: SalesforceProfile }
  | { readonly kind: "missing-id"; readonly id: string; readonly profile: SalesforceProfile };

export const registrySelection = (input: {
  readonly only?: string;
  readonly profile?: string;
}): Effect.Effect<
  ReadonlyArray<RegistrySelectionEntry>,
  UnknownSalesforceSourceError | UnknownSalesforceProfileError
> =>
  Effect.gen(function* () {
    if (input.only !== undefined && input.only.length > 0) {
      const source = sourceById(input.only);
      if (!source) {
        return yield* new UnknownSalesforceSourceError({ id: input.only });
      }
      return [{ kind: "include" as const, source }];
    }

    if (input.profile !== undefined && input.profile.length > 0) {
      if (!isSalesforceProfile(input.profile)) {
        return yield* new UnknownSalesforceProfileError({ profile: input.profile });
      }
      const entries: RegistrySelectionEntry[] = [];
      for (const id of profileSourceIds[input.profile]) {
        const source = sourceById(id);
        if (!source) {
          entries.push({ kind: "missing-id", id, profile: input.profile });
          continue;
        }
        if (!source.executorSourceConfig) {
          entries.push({ kind: "docs-only", id, profile: input.profile });
          continue;
        }
        entries.push({ kind: "include", source });
      }
      return entries;
    }

    return salesforceSourceRegistry
      .filter((source) => source.executorSourceConfig)
      .map((source) => ({ kind: "include" as const, source }));
  });

// ── External prerequisites ───────────────────────────────────────────────

export const data360JarExists = (): boolean => {
  const jar = data360McpJar();
  return jar.length > 0 && existsSync(jar);
};

/**
 * External-prerequisite gate for source ids that need a local repo / jar.
 * Returns the missing env var name when the prereq is unsatisfied so the
 * caller can skip with a clear message instead of registering a launcher
 * that cannot run.
 */
export const missingExternalPrereq = (sourceId: string): string | undefined => {
  if (sourceId === "data360-mcp" && data360PluginRoot().length === 0) {
    return "D360_CODEX_PLUGIN_ROOT";
  }
  return undefined;
};

/**
 * Resolve the org alias from CLI args + env. Surfaces a tagged error if
 * none is found so callers can render a consistent message.
 */
export const resolveOrgAlias = (
  fromArgs: string | undefined,
): Effect.Effect<string, MissingOrgAliasError> =>
  Effect.gen(function* () {
    const alias = fromArgs ?? process.env.D360_ORG_ALIAS ?? process.env.SF_TARGET_ORG ?? "";
    if (alias.length === 0) {
      return yield* new MissingOrgAliasError({
        message:
          "No Salesforce org alias provided. Pass --org <alias>, or set D360_ORG_ALIAS / SF_TARGET_ORG.",
      });
    }
    return alias;
  });
