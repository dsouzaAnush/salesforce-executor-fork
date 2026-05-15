#!/usr/bin/env node
/* oxlint-disable executor/no-json-parse, executor/no-promise-catch, executor/no-unknown-error-message, executor/no-try-catch-or-throw, executor/no-instanceof-error -- boundary: stdio MCP adapter parses JSON-RPC frames and surfaces upstream HTTP failures to clients */
//
// Informatica IDMC local stdio MCP adapter.
//
// Hardening contract (mirrored in informatica-idmc.test.ts):
// - The `method` argument is checked against ALLOWED_METHODS at runtime so a
//   client that ignores the JSON-Schema enum cannot reach the upstream API
//   with `OPTIONS`, `HEAD`, etc.
// - `body` is validated as a plain JSON object before forwarding; arrays and
//   primitives are rejected with a clear error message.
// - INFORMATICA_BASE_URL is parsed and required to use https: at startup so
//   bearer tokens are never sent over a plain HTTP boundary.
// - The adapter never persists tokens; INFORMATICA_BEARER_TOKEN /
//   INFORMATICA_SESSION_ID are read per-request from process.env.

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

let buffer = Buffer.alloc(0);

const tools = [
  {
    name: "informatica_idmc_families",
    description:
      "List official Informatica IDMC REST API resource families represented by this local adapter.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "IDMC API families", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "informatica_idmc_request",
    description:
      "Call an official Informatica IDMC REST API path using local INFORMATICA_* credentials.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: [...ALLOWED_METHODS] },
        path: {
          type: "string",
          description: "Path beginning with /, relative to INFORMATICA_BASE_URL.",
        },
        body: { type: "object", additionalProperties: true },
      },
      required: ["method", "path"],
      additionalProperties: false,
    },
    annotations: { title: "IDMC REST request", destructiveHint: true, openWorldHint: true },
  },
];

const families = [
  "Login and session management",
  "Organizations and users",
  "Assets and projects",
  "Runtime environments",
  "Cloud Data Integration jobs",
  "Connections and secure agents",
];

const send = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const errorResult = (id, message) => ({
  jsonrpc: "2.0",
  id,
  result: { isError: true, content: [{ type: "text", text: message }] },
});

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validate INFORMATICA_BASE_URL once per request. We do this lazily rather
 * than at startup so the adapter still successfully replies to
 * `initialize`/`tools/list` when env is unset — the test harness in
 * `informatica-idmc.test.ts` relies on those discovery calls working
 * without credentials.
 */
const resolveBaseUrl = () => {
  const raw = process.env.INFORMATICA_BASE_URL;
  if (!raw) return { ok: false, reason: "INFORMATICA_BASE_URL is not set" };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, reason: `INFORMATICA_BASE_URL is not a valid URL: ${reason}` };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: `INFORMATICA_BASE_URL must use https: (got ${parsed.protocol}). Bearer tokens are not sent over plain HTTP.`,
    };
  }
  return { ok: true, baseUrl: parsed.toString() };
};

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
        serverInfo: { name: "informatica-idmc-api-adapter", version: "0.2.0" },
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
  if (method === "tools/call" && params?.name === "informatica_idmc_families") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                families,
                officialDocs:
                  "https://docs.informatica.com/integration-cloud/cloud-platform/current-version/rest-api-reference/informatica-intelligent-cloud-services-rest-api.html",
              },
              null,
              2,
            ),
          },
        ],
      },
    });
    return;
  }
  if (method === "tools/call" && params?.name === "informatica_idmc_request") {
    const args = params.arguments ?? {};

    // Method allowlist — must be enforced at runtime because the JSON-Schema
    // enum is only advisory for the calling MCP client.
    const argMethod = typeof args.method === "string" ? args.method.toUpperCase() : "";
    if (!ALLOWED_METHODS.has(argMethod)) {
      send(
        errorResult(
          id,
          `method must be one of ${[...ALLOWED_METHODS].join(", ")} (got ${JSON.stringify(args.method)})`,
        ),
      );
      return;
    }

    const argPath = typeof args.path === "string" ? args.path : "";
    if (!argPath.startsWith("/")) {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: "path must start with /" } });
      return;
    }

    if (args.body !== undefined && !isPlainObject(args.body)) {
      send(
        errorResult(
          id,
          `body must be a JSON object (got ${Array.isArray(args.body) ? "array" : typeof args.body})`,
        ),
      );
      return;
    }

    const baseUrlResult = resolveBaseUrl();
    if (!baseUrlResult.ok) {
      send(errorResult(id, baseUrlResult.reason));
      return;
    }
    const bearer = process.env.INFORMATICA_BEARER_TOKEN;
    const session = process.env.INFORMATICA_SESSION_ID;
    if (!bearer && !session) {
      send(errorResult(id, "Missing INFORMATICA_BEARER_TOKEN or INFORMATICA_SESSION_ID."));
      return;
    }

    const headers = new Headers({ accept: "application/json" });
    if (bearer) headers.set("authorization", `Bearer ${bearer}`);
    if (session) headers.set("INFA-SESSION-ID", session);
    if (args.body !== undefined) headers.set("content-type", "application/json");

    let response;
    try {
      response = await fetch(new URL(argPath, baseUrlResult.baseUrl), {
        method: argMethod,
        headers,
        body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      send(errorResult(id, `request failed: ${reason}`));
      return;
    }

    let text;
    try {
      text = await response.text();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      send(errorResult(id, `failed to read response body: ${reason}`));
      return;
    }

    send({
      jsonrpc: "2.0",
      id,
      result: {
        isError: !response.ok,
        content: [{ type: "text", text }],
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

// Exposed for testing: the in-process handler. Test harness spawns the
// adapter as a child process and drives stdio framing.
export const __test__ = { handle, resolveBaseUrl, isPlainObject, ALLOWED_METHODS };
