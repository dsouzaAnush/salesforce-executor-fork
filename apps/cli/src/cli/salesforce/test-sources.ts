/**
 * Registry invariant smoke runner used by `bun run test:sources`. Pairs
 * with `packages/salesforce-docs-index/src/registry.test.ts` and adds
 * cross-package invariants the vitest run can't see (token substitution,
 * absence of `CDP_ACCESS_TOKEN` in any apps/<name>/executor.jsonc,
 * optional smoke against a live local daemon).
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Cause, Effect, Exit, Predicate, Result } from "effect";

import {
  productGroupForSourceId,
  salesforceSourceRegistry,
  sourceLogoKeys,
  sourceProductGroups,
} from "@salesforce-executor/docs-index";

import {
  data360JarExists,
  executorUrl,
  getScope,
  RegistryInvariantError,
  requestJson,
  substituteEnvTokens,
} from "./lib";

export type TestSourcesReport = {
  readonly registryCount: number;
  readonly data360JarPresent: boolean;
  readonly executorReachable: boolean;
  readonly executorSources?: number;
  readonly executorScopeId?: string;
};

const ensureRegistryInvariants = (): Effect.Effect<void, RegistryInvariantError> =>
  Effect.gen(function* () {
    const ids = new Set<string>();
    for (const source of salesforceSourceRegistry) {
      if (ids.has(source.id)) {
        return yield* new RegistryInvariantError({
          message: `Duplicate source id: ${source.id}`,
        });
      }
      ids.add(source.id);
      if (!source.docsUrl.startsWith("https://")) {
        return yield* new RegistryInvariantError({
          message: `${source.id} docsUrl must be https`,
        });
      }
      if (source.skills.length === 0) {
        return yield* new RegistryInvariantError({
          message: `${source.id} needs at least one skill`,
        });
      }
      if (source.executorSourceConfig && "env" in source.executorSourceConfig) {
        const envKeys = Object.keys(source.executorSourceConfig.env ?? {});
        if (envKeys.includes("CDP_ACCESS_TOKEN")) {
          return yield* new RegistryInvariantError({
            message: `${source.id} must not persist CDP_ACCESS_TOKEN in source config`,
          });
        }
      }
      if (productGroupForSourceId(source.id) === undefined) {
        return yield* new RegistryInvariantError({
          message: `${source.id} is missing a product group entry in sourceProductGroups`,
        });
      }
    }

    for (const id of Object.keys(sourceLogoKeys)) {
      if (!ids.has(id)) {
        return yield* new RegistryInvariantError({
          message: `sourceLogoKeys contains unknown source id "${id}"`,
        });
      }
    }
    for (const id of Object.keys(sourceProductGroups)) {
      if (!ids.has(id)) {
        return yield* new RegistryInvariantError({
          message: `sourceProductGroups contains unknown source id "${id}"`,
        });
      }
    }
  });

const ensureTokenSubstitution = (): Effect.Effect<void, RegistryInvariantError> =>
  Effect.sync(() =>
    substituteEnvTokens(
      "${SALESFORCE_EXECUTOR_ROOT}/scripts/run-data360-mcp.sh ${D360_ORG_ALIAS}",
      "fixture-org",
    ),
  ).pipe(
    Effect.flatMap((sample) => {
      if (sample.includes("${")) {
        return Effect.fail(
          new RegistryInvariantError({
            message: `substituteEnvTokens did not resolve all tokens: ${sample}`,
          }),
        );
      }
      const orgAlias = process.env.D360_ORG_ALIAS ?? "";
      if (!sample.endsWith(" fixture-org") && !sample.endsWith(` ${orgAlias}`)) {
        return Effect.fail(
          new RegistryInvariantError({
            message: `substituteEnvTokens did not bind D360_ORG_ALIAS: ${sample}`,
          }),
        );
      }
      return Effect.void;
    }),
  );

const collectExecutorConfigs = (root: string): ReadonlyArray<string> => {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (!statSync(full).isDirectory()) continue;
    const config = join(full, "executor.jsonc");
    if (existsSync(config)) out.push(config);
  }
  return out;
};

const ensureNoCdpAccessTokens = (): Effect.Effect<void, RegistryInvariantError> =>
  Effect.gen(function* () {
    for (const config of collectExecutorConfigs("apps")) {
      const text = yield* Effect.tryPromise({
        try: () => readFile(config, "utf8"),
        catch: (cause) =>
          new RegistryInvariantError({
            message: `failed to read ${config}: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
      });
      if (text.includes("CDP_ACCESS_TOKEN")) {
        return yield* new RegistryInvariantError({
          message: `${config} contains CDP_ACCESS_TOKEN; use scripts/run-data360-mcp.sh instead`,
        });
      }
    }
  });

export const testSourcesEffect: Effect.Effect<TestSourcesReport, RegistryInvariantError> =
  Effect.gen(function* () {
    yield* ensureRegistryInvariants();
    yield* Effect.sync(() => {
      console.log(
        `ok registry: ${salesforceSourceRegistry.length} Salesforce-family source definitions`,
      );
    });

    const jarPresent = data360JarExists();
    yield* Effect.sync(() => {
      console.log(
        `${jarPresent ? "ok" : "warn"} data360 jar: ${jarPresent ? "present" : "missing"}`,
      );
    });

    yield* ensureTokenSubstitution();
    yield* Effect.sync(() => {
      console.log("ok substituteEnvTokens resolves repo + plugin + org tokens");
    });

    yield* ensureNoCdpAccessTokens();

    // Daemon smoke is optional — when no daemon is running the script keeps
    // its zero exit so CI/lint pipelines can call test:sources without first
    // booting the local app.
    const smokeExit = yield* Effect.exit(
      Effect.gen(function* () {
        const scope = yield* getScope();
        const sources = yield* requestJson<
          ReadonlyArray<{ readonly id: string; readonly toolCount: number }>
        >(`/api/scopes/${scope.id}/sources`);
        return { sourceCount: sources.length, scopeId: scope.id };
      }),
    );

    if (Exit.isFailure(smokeExit)) {
      yield* Effect.sync(() => {
        const found = Cause.findError(smokeExit.cause);
        const error = Result.isSuccess(found) ? found.success : undefined;
        let message: string;
        if (!error) {
          message = "daemon unreachable";
        } else if (Predicate.isTagged(error, "ExecutorHttpStatusError")) {
          message = `${error.method} ${error.path} returned ${error.status}`;
        } else {
          message = `${error.method} ${error.path}: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`;
        }
        console.log(`warn executor smoke skipped: ${message}`);
      });
      return {
        registryCount: salesforceSourceRegistry.length,
        data360JarPresent: jarPresent,
        executorReachable: false,
      };
    }

    yield* Effect.sync(() => {
      console.log(
        `ok executor reachable (${executorUrl()}): ${smokeExit.value.sourceCount} source(s) in scope ${smokeExit.value.scopeId}`,
      );
    });

    return {
      registryCount: salesforceSourceRegistry.length,
      data360JarPresent: jarPresent,
      executorReachable: true,
      executorSources: smokeExit.value.sourceCount,
      executorScopeId: smokeExit.value.scopeId,
    };
  });

/** Promise wrapper used by `scripts/salesforce/test-sources.ts`. */
export const testSources = (): Promise<TestSourcesReport> => Effect.runPromise(testSourcesEffect);
