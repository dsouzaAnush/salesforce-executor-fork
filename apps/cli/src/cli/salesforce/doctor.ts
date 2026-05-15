/**
 * `salesforce-executor doctor` — probe local prerequisites for the curated
 * Salesforce source catalog. Reports missing CLIs and Data 360 artifacts
 * without failing; the caller's exit code stays 0 unless a hard error
 * occurs (everything reportable is informational).
 */

import { Command } from "effect/unstable/cli";
import { Effect } from "effect";

import { salesforceSourceRegistry } from "@salesforce-executor/docs-index";

import {
  checkExecutable,
  data360JarExists,
  data360McpJar,
  data360PluginRoot,
  executorUrl,
  runCli,
  type CliResult,
} from "./lib";

export type DoctorReport = {
  readonly executorUrl: string;
  readonly registeredSourceCount: number;
  readonly cliChecks: ReadonlyArray<CliResult>;
  readonly data360Jar: { readonly path: string; readonly present: boolean };
  readonly data360PluginRoot: { readonly path: string; readonly present: boolean };
};

export const doctorEffect: Effect.Effect<DoctorReport> = Effect.gen(function* () {
  const cliChecks: CliResult[] = [];
  for (const check of [
    checkExecutable("bun", ["--version"]),
    checkExecutable("node", ["--version"]),
    checkExecutable("sf", ["--version"]),
    checkExecutable("heroku", ["--version"]),
    checkExecutable("slack", ["--version"]),
    checkExecutable("anypoint-cli-v4", ["--version"]),
    runCli("java", ["-version"]),
  ]) {
    const result = yield* check;
    cliChecks.push(result);
  }

  const jar = data360McpJar();
  const pluginRoot = data360PluginRoot();
  const jarPath = jar.length > 0 ? jar : "(D360_MCP_JAR / D360_MCP_REPO unset)";
  const jarPresent = data360JarExists();
  const pluginPath = pluginRoot.length > 0 ? pluginRoot : "(D360_CODEX_PLUGIN_ROOT unset)";
  const pluginPresent = pluginRoot.length > 0;
  const url = executorUrl();

  yield* Effect.sync(() => {
    console.log("Salesforce Executor doctor");
    console.log(`Executor URL: ${url}`);
    console.log(`Registered source definitions: ${salesforceSourceRegistry.length}`);
    for (const check of cliChecks) {
      console.log(`${check.ok ? "ok " : "miss"} ${check.command}`);
      if (!check.ok) console.log(`  ${check.output.split("\n")[0] ?? "not found"}`);
    }
    console.log(`${jarPresent ? "ok " : "miss"} Data 360 MCP jar ${jarPath}`);
    if (!jarPresent) {
      console.log("  Set D360_MCP_REPO to your local Data 360 MCP server clone, then run:");
      console.log('    cd "$D360_MCP_REPO" && mvn clean package -DskipTests');
      console.log("  Or set D360_MCP_JAR to an already-built jar path.");
    }
    console.log(`${pluginPresent ? "ok " : "miss"} Data 360 Codex plugin root ${pluginPath}`);
    if (!pluginPresent) {
      console.log("  Set D360_CODEX_PLUGIN_ROOT to your local Data 360 Codex plugin clone.");
    }
  });

  return {
    executorUrl: url,
    registeredSourceCount: salesforceSourceRegistry.length,
    cliChecks,
    data360Jar: { path: jarPath, present: jarPresent },
    data360PluginRoot: { path: pluginPath, present: pluginPresent },
  };
});

/** Promise wrapper used by `scripts/salesforce/doctor.ts`. */
export const doctor = (): Promise<DoctorReport> => Effect.runPromise(doctorEffect);

// ── CLI command ──────────────────────────────────────────────────────────

export const doctorCommand = Command.make("doctor", {}, () =>
  doctorEffect.pipe(Effect.asVoid),
).pipe(
  Command.withDescription(
    "Probe local prerequisites (bun, node, sf, heroku, slack, anypoint-cli-v4, java) and Data 360 artifacts.",
  ),
);
