/* oxlint-disable executor/no-try-catch-or-throw, executor/no-error-constructor, executor/no-json-parse, executor/no-promise-reject -- boundary: stdio integration test parses adapter-emitted JSON-RPC frames and uses Promise primitives for child-process timing */

/**
 * Integration tests for the Informatica IDMC stdio MCP adapter.
 *
 * Spawns `adapters/informatica-idmc/informatica-idmc.mjs` as a child
 * process, drives JSON-RPC line-delimited frames, and asserts the hardened
 * behaviors documented at the top of the adapter:
 *
 *   - `tools/list` is reachable without credentials.
 *   - The `method` allowlist rejects non-allowed verbs even when a client
 *     ignores the JSON-Schema enum.
 *   - `body` must be a JSON object — arrays and primitives are rejected.
 *   - `INFORMATICA_BASE_URL` must use https:.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@effect/vitest";

const adapterPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../adapters/informatica-idmc/informatica-idmc.mjs",
);

type JsonRpcMessage = {
  readonly id?: number | string;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
};

const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage =>
  typeof value === "object" && value !== null && ("result" in value || "error" in value);

const isToolCallResult = (
  value: unknown,
): value is {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
} =>
  typeof value === "object" &&
  value !== null &&
  "content" in value &&
  Array.isArray((value as { content: unknown }).content);

class Harness {
  private readonly child: ChildProcessWithoutNullStreams;
  private stdout = "";
  private readonly pending: Array<(line: string) => void> = [];

  constructor(env: Readonly<Record<string, string>>) {
    this.child = spawn("node", [adapterPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdout += chunk.toString("utf8");
      let nl = this.stdout.indexOf("\n");
      while (nl !== -1) {
        const line = this.stdout.slice(0, nl).trim();
        this.stdout = this.stdout.slice(nl + 1);
        if (line.length > 0) {
          const waiter = this.pending.shift();
          if (waiter) waiter(line);
        }
        nl = this.stdout.indexOf("\n");
      }
    });
  }

  send(message: Readonly<Record<string, unknown>>): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async request(
    id: number,
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<JsonRpcMessage> {
    const line = await new Promise<string>((resolveLine) => {
      this.pending.push(resolveLine);
      this.send(params ? { jsonrpc: "2.0", id, method, params } : { jsonrpc: "2.0", id, method });
    });
    const parsed: unknown = JSON.parse(line);
    if (!isJsonRpcMessage(parsed)) throw new Error(`adapter returned non-JSON-RPC frame: ${line}`);
    return parsed;
  }

  dispose(): void {
    this.child.kill();
  }
}

const withHarness = async (
  env: Readonly<Record<string, string>>,
  body: (h: Harness) => Promise<void>,
): Promise<void> => {
  const harness = new Harness(env);
  try {
    await body(harness);
  } finally {
    harness.dispose();
  }
};

describe("informatica idmc stdio adapter", () => {
  it("answers tools/list without requiring credentials", async () => {
    await withHarness({}, async (h) => {
      const result = await h.request(1, "tools/list");
      const tools = (result.result as { tools: Array<{ name: string }> }).tools;
      const names = tools.map((tool) => tool.name);
      expect(names).toContain("informatica_idmc_request");
      expect(names).toContain("informatica_idmc_families");
    });
  });

  it("returns the families catalog without contacting an upstream API", async () => {
    await withHarness({}, async (h) => {
      const result = await h.request(2, "tools/call", {
        name: "informatica_idmc_families",
      });
      expect(isToolCallResult(result.result)).toBe(true);
      const payload = (result.result as { content: Array<{ text: string }> }).content[0]?.text;
      expect(typeof payload).toBe("string");
      const parsed = JSON.parse(payload!) as { families: string[]; officialDocs: string };
      expect(parsed.families.length).toBeGreaterThan(0);
      expect(parsed.officialDocs.startsWith("https://docs.informatica.com/")).toBe(true);
    });
  });

  it("rejects disallowed HTTP methods at runtime, even with valid env", async () => {
    await withHarness(
      {
        INFORMATICA_BASE_URL: "https://example.invalid",
        INFORMATICA_BEARER_TOKEN: "test-token",
      },
      async (h) => {
        const result = await h.request(3, "tools/call", {
          name: "informatica_idmc_request",
          arguments: { method: "OPTIONS", path: "/v1/whatever" },
        });
        const value = result.result;
        if (!isToolCallResult(value)) throw new Error("expected toolCallResult");
        expect(value.isError).toBe(true);
        expect(value.content[0]?.text ?? "").toContain("method must be one of");
      },
    );
  });

  it("rejects non-object bodies", async () => {
    await withHarness(
      {
        INFORMATICA_BASE_URL: "https://example.invalid",
        INFORMATICA_BEARER_TOKEN: "test-token",
      },
      async (h) => {
        const result = await h.request(4, "tools/call", {
          name: "informatica_idmc_request",
          arguments: { method: "POST", path: "/v1/x", body: [1, 2, 3] },
        });
        const value = result.result;
        if (!isToolCallResult(value)) throw new Error("expected toolCallResult");
        expect(value.isError).toBe(true);
        expect(value.content[0]?.text ?? "").toContain("body must be a JSON object");
      },
    );
  });

  it("refuses non-https base URLs so bearer tokens cannot leak in cleartext", async () => {
    await withHarness(
      {
        INFORMATICA_BASE_URL: "http://example.invalid",
        INFORMATICA_BEARER_TOKEN: "test-token",
      },
      async (h) => {
        const result = await h.request(5, "tools/call", {
          name: "informatica_idmc_request",
          arguments: { method: "GET", path: "/v1/x" },
        });
        const value = result.result;
        if (!isToolCallResult(value)) throw new Error("expected toolCallResult");
        expect(value.isError).toBe(true);
        expect(value.content[0]?.text ?? "").toContain("must use https:");
      },
    );
  });

  it("rejects paths that do not start with /", async () => {
    await withHarness(
      {
        INFORMATICA_BASE_URL: "https://example.invalid",
        INFORMATICA_BEARER_TOKEN: "test-token",
      },
      async (h) => {
        const result = await h.request(6, "tools/call", {
          name: "informatica_idmc_request",
          arguments: { method: "GET", path: "missing-leading-slash" },
        });
        expect(result.error?.message ?? "").toContain("path must start with /");
      },
    );
  });
});
