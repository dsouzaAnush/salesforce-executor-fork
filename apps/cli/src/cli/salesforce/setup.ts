/**
 * `salesforce-executor setup` — idempotently register the Salesforce-family
 * MCP catalog with the running Executor daemon, plus seed approval-required
 * policies for destructive tool patterns.
 *
 * The Effect-typed entry point `setupEffect` is exposed for tests and the
 * companion `scripts/salesforce/setup.ts` bun wrapper. The `setupCommand`
 * value is wired into `apps/cli/src/main.ts` under `Command.withSubcommands`.
 */

import { Command, Flag as Options } from "effect/unstable/cli";
import { Cause, Effect, Exit, Option, Predicate, Result } from "effect";

import {
  executorUrl,
  getScope,
  missingExternalPrereq,
  registerMcpSource,
  registerPolicyDefaults,
  registrySelection,
  resolveOrgAlias,
  sfOrgDisplay,
  type ExecutorHttpError,
  type ExecutorHttpStatusError,
  type MissingOrgAliasError,
  type NotAnMcpSourceError,
  type RegisterMcpResult,
  type UnknownSalesforceProfileError,
  type UnknownSalesforceSourceError,
} from "./lib";

export type SetupOptions = {
  readonly profile?: string;
  readonly only?: string;
  readonly org?: string;
};

export type SetupSourceOutcome =
  | { readonly id: string; readonly status: "registered"; readonly result: RegisterMcpResult }
  | {
      readonly id: string;
      readonly status: "skipped-not-mcp";
    }
  | {
      readonly id: string;
      readonly status: "skipped-missing-prereq";
      readonly missingEnv: string;
    }
  | {
      readonly id: string;
      readonly status: "skipped-docs-only";
      readonly profile: string;
    }
  | {
      readonly id: string;
      readonly status: "skipped-missing-id";
      readonly profile: string;
    }
  | { readonly id: string; readonly status: "failed"; readonly message: string };

export type SetupSummary = {
  readonly scopeId: string;
  readonly orgAlias: string;
  readonly orgUsername?: string;
  readonly profile?: string;
  readonly only?: string;
  readonly outcomes: ReadonlyArray<SetupSourceOutcome>;
};

const formatError = (
  error: ExecutorHttpError | ExecutorHttpStatusError | NotAnMcpSourceError,
): string => {
  if (Predicate.isTagged(error, "ExecutorHttpStatusError")) {
    return `${error.method} ${error.path} returned ${error.status}: ${error.body}`;
  }
  if (Predicate.isTagged(error, "NotAnMcpSourceError")) {
    return `${error.id} is not an MCP source`;
  }
  // ExecutorHttpError
  return `${error.method} ${error.path} failed: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`;
};

/**
 * Effect-typed entry point. Tagged errors:
 *  - {@link MissingOrgAliasError} — no `--org` and no env fallback.
 *  - {@link ExecutorHttpError}/{@link ExecutorHttpStatusError} — daemon unreachable
 *    or refused a setup request before any source was registered. Per-source
 *    failures are captured as `outcomes[].status === "failed"` rather than
 *    raised, so a registry walk continues past one broken source.
 *  - {@link UnknownSalesforceSourceError}/{@link UnknownSalesforceProfileError}
 *    — `--only`/`--profile` referenced something not in the registry.
 */
export const setupEffect = (
  options: SetupOptions,
): Effect.Effect<
  SetupSummary,
  | MissingOrgAliasError
  | ExecutorHttpError
  | ExecutorHttpStatusError
  | UnknownSalesforceSourceError
  | UnknownSalesforceProfileError
> =>
  Effect.gen(function* () {
    const orgAlias = yield* resolveOrgAlias(options.org);
    const selection = yield* registrySelection({
      only: options.only,
      profile: options.profile,
    });
    const scope = yield* getScope();
    const org = yield* sfOrgDisplay(orgAlias);

    const orgUsername = typeof org?.username === "string" ? org.username : undefined;

    yield* Effect.sync(() => {
      console.log("Salesforce Executor setup");
      console.log(`Executor URL: ${executorUrl()}`);
      console.log(`Scope: ${scope.id}`);
      console.log(`Org alias: ${orgAlias}${orgUsername ? ` (${orgUsername})` : ""}`);
      if (options.profile) console.log(`Profile: ${options.profile}`);
      if (options.only) console.log(`Only: ${options.only}`);
    });

    yield* registerPolicyDefaults(scope.id);
    yield* Effect.sync(() => {
      console.log("Policy defaults: require approval for destructive/high-risk patterns");
    });

    const outcomes: SetupSourceOutcome[] = [];
    for (const entry of selection) {
      if (entry.kind === "missing-id") {
        outcomes.push({ id: entry.id, status: "skipped-missing-id", profile: entry.profile });
        yield* Effect.sync(() => {
          console.warn(`warn profile ${entry.profile}: unknown source id "${entry.id}" (skipped)`);
        });
        continue;
      }
      if (entry.kind === "docs-only") {
        outcomes.push({ id: entry.id, status: "skipped-docs-only", profile: entry.profile });
        yield* Effect.sync(() => {
          console.warn(
            `note profile ${entry.profile}: ${entry.id} is docs-only — paste the org-specific endpoint into Executor manually`,
          );
        });
        continue;
      }

      const source = entry.source;
      if (!source.executorSourceConfig || "kind" in source.executorSourceConfig) {
        outcomes.push({ id: source.id, status: "skipped-not-mcp" });
        yield* Effect.sync(() => {
          console.log(`skip ${source.id}: not directly registrable by setup`);
        });
        continue;
      }

      const missing = missingExternalPrereq(source.id);
      if (missing) {
        outcomes.push({ id: source.id, status: "skipped-missing-prereq", missingEnv: missing });
        yield* Effect.sync(() => {
          console.log(`skip ${source.id}: set ${missing} to enable this source`);
        });
        continue;
      }

      const exit = yield* Effect.exit(registerMcpSource(scope.id, source, orgAlias));

      if (Exit.isFailure(exit)) {
        const head = Cause.findError(exit.cause);
        const message = Result.isSuccess(head)
          ? formatError(head.success)
          : "registerMcpSource failed";
        outcomes.push({ id: source.id, status: "failed", message });
        yield* Effect.sync(() => {
          console.log(`warn ${source.id}: ${message}`);
        });
        continue;
      }

      const reg = exit.value;
      outcomes.push({ id: source.id, status: "registered", result: reg });
      const counts = reg.status === "unchanged" ? "no change" : `${reg.toolCount} tools`;
      const tag = reg.status === "unchanged" ? "skip" : "ok  ";
      yield* Effect.sync(() => {
        console.log(`${tag} ${source.id}: ${reg.namespace} (${counts}, ${reg.status})`);
      });
    }

    yield* Effect.sync(() => {
      console.log(
        "Done. Secrets and OAuth sign-ins stay in Executor/CLI stores; no tokens were printed.",
      );
    });

    return {
      scopeId: scope.id,
      orgAlias,
      orgUsername,
      profile: options.profile,
      only: options.only,
      outcomes,
    };
  });

/** Promise wrapper used by `scripts/salesforce/setup.ts`. */
export const setup = (options: SetupOptions): Promise<SetupSummary> =>
  Effect.runPromise(setupEffect(options));

// ── CLI command ──────────────────────────────────────────────────────────

const profile = Options.choice("profile", ["core", "data", "full"] as const).pipe(
  Options.optional,
  Options.withDescription(
    "Registry profile: `core` (Salesforce platform only), `data` (Data 360 focused), or `full` (every registry source).",
  ),
);

const only = Options.string("only").pipe(
  Options.optional,
  Options.withDescription("Register a single source by registry id (e.g. `--only data360-mcp`)."),
);

const org = Options.string("org").pipe(
  Options.optional,
  Options.withDescription("Salesforce org alias (falls back to D360_ORG_ALIAS / SF_TARGET_ORG)."),
);

const formatTopLevelError = (
  error:
    | MissingOrgAliasError
    | ExecutorHttpError
    | ExecutorHttpStatusError
    | UnknownSalesforceSourceError
    | UnknownSalesforceProfileError,
): string => {
  if (Predicate.isTagged(error, "MissingOrgAliasError")) return error.message;
  if (Predicate.isTagged(error, "UnknownSalesforceSourceError")) {
    return `Unknown Salesforce source id: ${error.id}`;
  }
  if (Predicate.isTagged(error, "UnknownSalesforceProfileError")) {
    return `Unknown Salesforce profile: ${error.profile}. Expected one of: core, data, full.`;
  }
  if (Predicate.isTagged(error, "ExecutorHttpStatusError")) {
    return `${error.method} ${executorUrl()}${error.path} returned ${error.status}: ${error.body}`;
  }
  // ExecutorHttpError
  return `${error.method} ${executorUrl()}${error.path} failed: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}. Is the Executor daemon running at ${executorUrl()}?`;
};

export const setupCommand = Command.make(
  "setup",
  { profile, only, org },
  ({ profile, only, org }) =>
    setupEffect({
      profile: Option.getOrUndefined(profile),
      only: Option.getOrUndefined(only),
      org: Option.getOrUndefined(org),
    }).pipe(
      Effect.asVoid,
      Effect.catch((error) =>
        Effect.sync(() => {
          console.error(formatTopLevelError(error));
          process.exitCode = 1;
        }),
      ),
    ),
).pipe(
  Command.withDescription(
    "Register the curated Salesforce-family source catalog with the running local Executor daemon.",
  ),
);
