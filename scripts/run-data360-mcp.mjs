#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const pluginRoot = process.env.D360_CODEX_PLUGIN_ROOT ?? "";
if (pluginRoot.length === 0) {
  process.stderr.write(
    "D360_CODEX_PLUGIN_ROOT is not set. Point it at a local clone of the Data 360 Codex plugin (the one that contains scripts/run-data360-mcp.sh) and re-run.\n",
  );
  process.exit(1);
}
const launcher = `${pluginRoot}/scripts/run-data360-mcp.sh`;
const orgAlias = process.env.D360_ORG_ALIAS ?? process.env.SF_TARGET_ORG ?? "";
if (orgAlias.length === 0) {
  process.stderr.write(
    "D360_ORG_ALIAS (or SF_TARGET_ORG) is not set. Set it to a Salesforce CLI org alias before launching the Data 360 MCP wrapper.\n",
  );
  process.exit(1);
}
const defaultPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const cleanEnv = (base) => {
  const next = {
    ...base,
    PATH: base.PATH ? `${base.PATH}:${defaultPath}` : defaultPath,
  };
  delete next.BUN_OPTIONS;
  delete next.NODE_OPTIONS;
  delete next.npm_config_user_agent;
  delete next.npm_execpath;
  delete next.npm_lifecycle_event;
  delete next.npm_lifecycle_script;
  return next;
};
const env = cleanEnv({
  ...process.env,
  D360_ORG_ALIAS: orgAlias,
});
const debugLog = process.env.D360_WRAPPER_LOG;
const debug = (message) => {
  if (!debugLog) return;
  appendFileSync(debugLog, `${new Date().toISOString()} ${message}\n`);
};
// oxlint-disable-next-line executor/no-unknown-error-message -- boundary: child_process error event exposes process spawn failures for stderr diagnostics
const errorMessage = (error) => String(error?.message ?? "Failed to spawn Data 360 MCP launcher");

// Tag any `sf` invocations this wrapper makes with a marker env var. The
// orphan reaper then kills only processes that *we* spawned in a prior
// run, leaving the user's interactive `sf org display` (and peer wrappers
// for unrelated orgs) untouched.
const WRAPPER_MARKER_ENV = "SALESFORCE_EXECUTOR_D360_WRAPPER";
const wrapperMarker = `${process.pid}-${Date.now()}`;

const sleepMs = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isWrapperOwnedSf = (pid) => {
  // We only want to reap children whose env contains our marker key —
  // anything else is a peer wrapper or an interactive shell we must
  // never touch. macOS exposes the env through `ps -E`, Linux through
  // `/proc/<pid>/environ`.
  if (process.platform === "linux") {
    // oxlint-disable-next-line executor/no-try-catch-or-throw -- boundary: /proc/<pid>/environ may disappear between pgrep and read
    try {
      const buf = readFileSync(`/proc/${pid}/environ`);
      return buf.includes(WRAPPER_MARKER_ENV);
    } catch {
      return false;
    }
  }
  if (process.platform === "darwin") {
    const result = spawnSync("ps", ["-E", "-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0 || !result.stdout) return false;
    return result.stdout.includes(`${WRAPPER_MARKER_ENV}=`);
  }
  return false;
};

const reapOrphans = async () => {
  // oxlint-disable-next-line executor/no-try-catch-or-throw -- boundary: pgrep is best-effort cleanup; failures must not block wrapper startup
  try {
    const pgrep = spawnSync("pgrep", ["-f", `${WRAPPER_MARKER_ENV}=`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (pgrep.status !== 0) return;
    const selfPid = String(process.pid);
    const candidates = pgrep.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== selfPid);
    const pids = candidates.filter(isWrapperOwnedSf);
    if (pids.length === 0) return;
    debug(`reaping ${pids.length} orphan sf processes pids=${pids.join(",")}`);
    // SIGTERM first — gives `sf` a chance to flush ~/.sfdx/auth.json
    // mid-token-refresh — then SIGKILL anything still alive after a
    // short grace window.
    spawnSync("kill", ["-15", ...pids], { stdio: "ignore" });
    await sleepMs(250);
    const recheck = spawnSync("ps", ["-o", "pid=", "-p", pids.join(",")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const survivors = recheck.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (survivors.length > 0) {
      spawnSync("kill", ["-9", ...survivors], { stdio: "ignore" });
    }
  } catch (error) {
    debug(`orphan reap skipped: ${errorMessage(error)}`);
  }
};

debug(`starting wrapper org=${orgAlias} launcher=${launcher} marker=${wrapperMarker}`);

// Best-effort cleanup of orphaned `sf org display` calls from prior wrapper
// runs that were terminated mid-call. The MCP supervisor sometimes kills
// this wrapper before the sf subprocess returns; the orphan then gets
// reparented to init and pegs a CPU core (sf doesn't always honor SIGTERM
// during token refresh).
if (orgAlias) {
  await reapOrphans();
}

if ((!env.CDP_ACCESS_TOKEN || !env.CDP_INSTANCE_URL) && orgAlias) {
  debug("reading sf cli org display");
  const sfEnv = cleanEnv({ ...env, [WRAPPER_MARKER_ENV]: wrapperMarker });
  const result = spawnSync("sf", ["org", "display", "-o", orgAlias, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: sfEnv,
    timeout: 10000,
    killSignal: "SIGKILL",
  });

  if (result.status === 0 && result.stdout.trim().length > 0) {
    debug("sf cli org display succeeded");
    // oxlint-disable-next-line executor/no-try-catch-or-throw -- boundary: local sf CLI can emit malformed JSON; launcher must fall back without crashing
    try {
      // oxlint-disable-next-line executor/no-json-parse -- boundary: sf CLI only exposes org display as JSON text
      const org = JSON.parse(result.stdout).result ?? {};
      if (org.accessToken && org.instanceUrl) {
        env.CDP_ACCESS_TOKEN = String(org.accessToken);
        env.CDP_INSTANCE_URL = String(org.instanceUrl);
        env.CDP_API_VERSION = String(org.apiVersion ?? "67.0");
        debug("sf cli auth exported to child env");
      }
    } catch {
      debug("sf cli org display parse failed");
      process.stderr.write(
        `Could not parse sf org display JSON for ${orgAlias}; falling back to existing Data 360 env.\n`,
      );
    }
  } else {
    debug(`sf cli org display failed status=${result.status ?? "null"}`);
    process.stderr.write(
      `Could not read Salesforce CLI org "${orgAlias}"; falling back to existing Data 360 env.\n`,
    );
  }
}

if (!existsSync(launcher)) {
  debug("launcher missing");
  process.stderr.write(`Data 360 MCP launcher not found at ${launcher}\n`);
  process.exit(1);
}

debug("spawning data360 plugin launcher");
const child = spawn("bash", [launcher], {
  cwd: pluginRoot,
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

process.stdin.pipe(child.stdin);

let stdoutBuffer = "";
const isJsonRpcLine = (line) => {
  // oxlint-disable-next-line executor/no-try-catch-or-throw -- boundary: MCP child stdout may include non-JSON startup logs that must be redirected
  try {
    // oxlint-disable-next-line executor/no-json-parse -- boundary: JSON-RPC framing is identified from child process stdout text
    const value = JSON.parse(line);
    return value && typeof value === "object" && value.jsonrpc === "2.0";
  } catch {
    return false;
  }
};

const routeStdoutLine = (line) => {
  const trimmed = line.trimStart();
  if (
    isJsonRpcLine(trimmed) ||
    trimmed.toLowerCase().startsWith("content-length:") ||
    line.trim().length === 0
  ) {
    process.stdout.write(`${line}\n`);
    return;
  }
  process.stderr.write(`${line}\n`);
};

child.stdout.on("data", (chunk) => {
  debug(`child stdout chunk bytes=${chunk.length}`);
  stdoutBuffer += chunk.toString();
  let newlineIndex = stdoutBuffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    routeStdoutLine(line);
    newlineIndex = stdoutBuffer.indexOf("\n");
  }
});

child.stdout.on("end", () => {
  debug("child stdout ended");
  if (stdoutBuffer.length > 0) {
    routeStdoutLine(stdoutBuffer);
    stdoutBuffer = "";
  }
});

child.stderr.on("data", (chunk) => {
  debug(`child stderr chunk bytes=${chunk.length}`);
  process.stderr.write(chunk);
});

child.on("exit", (code, signal) => {
  debug(`child exit code=${code ?? "null"} signal=${signal ?? "null"}`);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  const message = errorMessage(error);
  debug(`child spawn error ${message}`);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
