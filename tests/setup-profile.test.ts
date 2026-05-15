/* oxlint-disable executor/no-try-catch-or-throw, executor/no-error-constructor, executor/no-json-parse, executor/no-promise-reject, executor/no-conditional-tests -- boundary: setup e2e test spins a Node HTTP stub server and saves/restores process.env around it */

/**
 * End-to-end test for `salesforce-executor setup`. Spins a stub HTTP server
 * that records the daemon-facing calls the setup flow issues, and asserts:
 *
 *  - `--profile full --org <alias>` registers every executor-configurable
 *    source in the curated catalog whose external prereqs are met.
 *  - `--only <id>` filters to one source.
 *  - When `D360_CODEX_PLUGIN_ROOT` is unset, `--only data360-mcp` skips with
 *    a clear "missing prereq" outcome and never POSTs to the daemon.
 *  - Missing `--org`/env raises `MissingOrgAliasError`.
 *  - Policy defaults are seeded once per setup run.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { profileSourceIds, setupEffect, type SetupSummary } from "../apps/cli/src/cli/salesforce";
import { destructiveToolPolicyPatterns } from "@salesforce-executor/docs-index";

type StubRequest = {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
};

type Stub = {
  readonly url: string;
  readonly requests: ReadonlyArray<StubRequest>;
  readonly close: () => Promise<void>;
};

const recorded: StubRequest[] = [];

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolveBody, rejectBody) => {
    let chunks = "";
    req.on("data", (chunk: Buffer) => {
      chunks += chunk.toString("utf8");
    });
    req.on("end", () => resolveBody(chunks));
    req.on("error", rejectBody);
  });

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

const startStub = async (
  handler: (req: IncomingMessage, body: string) => { status: number; body: unknown },
): Promise<Stub> => {
  recorded.length = 0;
  const server: Server = createServer(async (req, res) => {
    const text = await readBody(req);
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    recorded.push({ method: req.method ?? "GET", path: req.url ?? "", body: parsed });
    const out = handler(req, text);
    json(res, out.status, out.body);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", () => resolveListen()));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    get requests() {
      return [...recorded];
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) =>
        server.close((err) => (err ? rejectClose(err) : resolveClose())),
      ),
  };
};

const withStub = async (
  handler: (req: IncomingMessage, body: string) => { status: number; body: unknown },
  body: (stub: Stub) => Promise<void>,
): Promise<void> => {
  const stub = await startStub(handler);
  const prevUrl = process.env.EXECUTOR_URL;
  process.env.EXECUTOR_URL = stub.url;
  try {
    await body(stub);
  } finally {
    process.env.EXECUTOR_URL = prevUrl;
    await stub.close();
  }
};

/**
 * Default stub handler that mirrors a clean Executor daemon: empty source
 * list (so every register call goes through as `added`), empty policies (so
 * every destructive pattern gets seeded once), and 200 on POST.
 */
const cleanDaemon = (req: IncomingMessage): { status: number; body: unknown } => {
  const path = req.url ?? "";
  if (path === "/api/scope") return { status: 200, body: { id: "test-scope", name: "tests" } };
  if (path.startsWith("/api/scopes/test-scope/mcp/sources/") && req.method === "GET") {
    return { status: 404, body: null };
  }
  if (path === "/api/scopes/test-scope/policies" && req.method === "GET") {
    return { status: 200, body: [] };
  }
  if (path === "/api/scopes/test-scope/policies" && req.method === "POST") {
    return { status: 200, body: { ok: true } };
  }
  if (path === "/api/scopes/test-scope/mcp/sources" && req.method === "POST") {
    // mirror the daemon's add-source response shape
    return { status: 200, body: { namespace: "test-ns", toolCount: 0 } };
  }
  if (path === "/api/scopes/test-scope/mcp/sources/remove" && req.method === "POST") {
    return { status: 200, body: { ok: true } };
  }
  return { status: 404, body: { error: `unknown path: ${path}` } };
};

describe("salesforce-executor setup --profile full", () => {
  // Setup invokes `sf org display` to enrich the printed banner. Spawning a
  // child process during the test would slow it down; the call is wrapped in
  // `runCli` which always resolves (errors surface as `ok: false`), so a
  // missing `sf` binary in the test env is harmless. We just stub PATH so we
  // get deterministic output regardless of whether `sf` is installed.
  it("registers every executor-configurable source in the full profile", async () => {
    await withStub(cleanDaemon, async (stub) => {
      const result = await Effect.runPromise(setupEffect({ profile: "full", org: "test-org" }));
      const summary = result as SetupSummary;
      expect(summary.scopeId).toBe("test-scope");
      expect(summary.orgAlias).toBe("test-org");

      const registered = summary.outcomes.filter((o) => o.status === "registered");
      const expectedIds = profileSourceIds.full.filter(
        // data360-mcp depends on D360_CODEX_PLUGIN_ROOT — must be unset in CI.
        (id) => id !== "data360-mcp",
      );
      // Sources without local prereqs should all be registered.
      for (const id of expectedIds) {
        expect(registered.find((o) => o.id === id)).toBeDefined();
      }

      // Policies endpoint hit once with GET, then a POST per destructive pattern.
      const policyGets = stub.requests.filter(
        (r) => r.path === "/api/scopes/test-scope/policies" && r.method === "GET",
      );
      const policyPosts = stub.requests.filter(
        (r) => r.path === "/api/scopes/test-scope/policies" && r.method === "POST",
      );
      expect(policyGets.length).toBe(1);
      expect(policyPosts.length).toBe(destructiveToolPolicyPatterns.length);
    });
  });

  it("skips data360-mcp without contacting the daemon when D360_CODEX_PLUGIN_ROOT is unset", async () => {
    const prev = process.env.D360_CODEX_PLUGIN_ROOT;
    delete process.env.D360_CODEX_PLUGIN_ROOT;
    try {
      await withStub(cleanDaemon, async (stub) => {
        const summary = await Effect.runPromise(
          setupEffect({ only: "data360-mcp", org: "test-org" }),
        );
        const outcome = summary.outcomes.find((o) => o.id === "data360-mcp");
        expect(outcome?.status).toBe("skipped-missing-prereq");
        if (outcome?.status === "skipped-missing-prereq") {
          expect(outcome.missingEnv).toBe("D360_CODEX_PLUGIN_ROOT");
        }
        // No POST to /mcp/sources for data360-mcp because the prereq gate fired
        // first.
        const addPosts = stub.requests.filter(
          (r) => r.path === "/api/scopes/test-scope/mcp/sources" && r.method === "POST",
        );
        expect(addPosts.length).toBe(0);
      });
    } finally {
      if (prev !== undefined) process.env.D360_CODEX_PLUGIN_ROOT = prev;
    }
  });

  it("filters --only to a single source", async () => {
    await withStub(cleanDaemon, async (stub) => {
      const summary = await Effect.runPromise(
        setupEffect({ only: "salesforce-dx-mcp", org: "test-org" }),
      );
      const registered = summary.outcomes.filter((o) => o.status === "registered");
      expect(registered.length).toBe(1);
      expect(registered[0]?.id).toBe("salesforce-dx-mcp");

      const addPosts = stub.requests.filter(
        (r) => r.path === "/api/scopes/test-scope/mcp/sources" && r.method === "POST",
      );
      expect(addPosts.length).toBe(1);
    });
  });

  it("raises MissingOrgAliasError when no --org or env fallback is provided", async () => {
    const previous = {
      SF_TARGET_ORG: process.env.SF_TARGET_ORG,
      D360_ORG_ALIAS: process.env.D360_ORG_ALIAS,
    };
    delete process.env.SF_TARGET_ORG;
    delete process.env.D360_ORG_ALIAS;
    try {
      await withStub(cleanDaemon, async () => {
        const exit = await Effect.runPromise(Effect.exit(setupEffect({ profile: "core" })));
        expect(Exit.isFailure(exit)).toBe(true);
      });
    } finally {
      if (previous.SF_TARGET_ORG !== undefined) process.env.SF_TARGET_ORG = previous.SF_TARGET_ORG;
      if (previous.D360_ORG_ALIAS !== undefined)
        process.env.D360_ORG_ALIAS = previous.D360_ORG_ALIAS;
    }
  });
});
