#!/usr/bin/env node
// oxlint-disable executor/no-json-parse, executor/no-promise-catch, executor/no-unknown-error-message -- boundary: stdio MCP adapter parses JSON-RPC frames and reports process failures to clients
import { spawn } from "node:child_process";

// Each entry is one wrapper tool. Because the same tool can dispatch to
// either read or write subcommands of the underlying CLI, the per-tool
// `destructiveHint` stays `true`; per-invocation approval is gated by
// `destructiveToolPolicyPatterns` in `packages/salesforce-docs-index/src/registry.ts`.
const CLIS = {
  sf: {
    command: "sf",
    description: "Run the official Salesforce CLI with explicit argv.",
    examples: ["org", "list", "--json"],
  },
  heroku: {
    command: "heroku",
    description: "Run the official Heroku CLI with explicit argv.",
    examples: ["apps", "--json"],
  },
  anypoint: {
    command: "anypoint-cli-v4",
    description: "Run the official Anypoint CLI v4 with explicit argv.",
    examples: ["account:user:describe"],
  },
  slack: {
    command: "slack",
    description: "Run the official Slack CLI with explicit argv.",
    examples: ["auth", "list"],
  },
};

const tools = Object.entries(CLIS).map(([id, cli]) => ({
  name: `${id}_cli_run`,
  description: `${cli.description} Pass args as an array; shell syntax is not accepted.`,
  inputSchema: {
    type: "object",
    properties: {
      args: {
        type: "array",
        items: { type: "string" },
        description: `Arguments only, for example ${JSON.stringify(cli.examples)}.`,
      },
      cwd: { type: "string", description: "Optional working directory." },
      timeoutMs: { type: "number", description: "Timeout in milliseconds. Defaults to 30000." },
    },
    required: ["args"],
    additionalProperties: false,
  },
  annotations: {
    title: `${cli.command} CLI`,
    // Wrapper tools dispatch to either read or write subcommands of the
    // underlying CLI; per-tool the safer signal is `destructiveHint: true`.
    // Per-invocation safety is gated by `destructiveToolPolicyPatterns` in
    // packages/salesforce-docs-index/src/registry.ts.
    destructiveHint: true,
    openWorldHint: true,
  },
}));

let buffer = Buffer.alloc(0);

const send = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

// Spawn the underlying CLI directly, no shell. Avoids depending on
// /bin/zsh, login shells, or user dotfiles, so this works on macOS, Linux
// CI runners, and inside containers without surprises. Users with CLIs
// in non-default locations (~/.local/bin, asdf/mise shims, etc.) can
// extend PATH for the child without touching the adapter by setting
// `SALESFORCE_FAMILY_CLI_PATH_PREPEND` (colon-separated list).
const run = (command, args, cwd, timeoutMs = 30000) =>
  new Promise((resolve) => {
    const platformPath =
      process.platform === "darwin"
        ? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        : "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    const userPrepend = process.env.SALESFORCE_FAMILY_CLI_PATH_PREPEND ?? "";
    const segments = [
      userPrepend.length > 0 ? userPrepend : null,
      process.env.PATH ?? null,
      platformPath,
    ].filter((value) => typeof value === "string" && value.length > 0);
    const childEnv = {
      ...process.env,
      PATH: segments.join(":"),
    };
    delete childEnv.NODE_ENV;
    const child = spawn(command, args, {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\nTimed out after ${timeoutMs}ms`;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: error.message });
    });
  });

const handle = async (message) => {
  const { id, method, params } = message;
  if (method === "notifications/initialized") return;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "salesforce-family-cli-bridge", version: "0.1.0" },
      },
    });
    return;
  }
  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }
  if (
    method === "resources/list" ||
    method === "resources/templates/list" ||
    method === "prompts/list"
  ) {
    send({ jsonrpc: "2.0", id, result: { resources: [], resourceTemplates: [], prompts: [] } });
    return;
  }
  if (method === "tools/call") {
    const name = params?.name;
    const cliId = typeof name === "string" ? name.replace(/_cli_run$/, "") : "";
    const cli = CLIS[cliId];
    if (!cli) {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown CLI tool: ${name}` } });
      return;
    }
    const args = Array.isArray(params?.arguments?.args) ? params.arguments.args.map(String) : [];
    if (args.some((arg) => arg.includes("\0"))) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "NUL bytes are not allowed in CLI args" },
      });
      return;
    }
    const result = await run(
      cli.command,
      args,
      typeof params?.arguments?.cwd === "string" ? params.arguments.cwd : undefined,
      Number(params?.arguments?.timeoutMs ?? 30000),
    );
    const text = [
      `$ ${cli.command} ${args.join(" ")}`,
      `exit ${result.code}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    send({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text }],
        isError: result.code !== 0,
      },
    });
    return;
  }
  if (id !== undefined)
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
};

const tryRead = () => {
  while (buffer.length > 0) {
    if (
      !buffer
        .toString("utf8", 0, Math.min(buffer.length, 64))
        .toLowerCase()
        .startsWith("content-length:")
    ) {
      const lineEnd = buffer.indexOf("\n");
      if (lineEnd === -1) return;
      const line = buffer.slice(0, lineEnd).toString("utf8").trim();
      buffer = buffer.slice(lineEnd + 1);
      if (line.length === 0) continue;
      void handle(JSON.parse(line)).catch((error) => {
        send({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message } });
      });
      continue;
    }
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) return;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;
    if (buffer.length < end) return;
    const body = buffer.slice(start, end).toString("utf8");
    buffer = buffer.slice(end);
    void handle(JSON.parse(body)).catch((error) => {
      send({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message } });
    });
  }
};

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  tryRead();
});
