/**
 * Refresh the cached HEAD/GET probe state for every entry in
 * `officialDocsIndex`. Writes `.cache/salesforce-docs-index/official-docs.json`
 * for diagnostic use by the doctor surface.
 */

import { mkdir, writeFile } from "node:fs/promises";

import { Cause, Data, Effect, Exit, Result } from "effect";

import { officialDocsIndex } from "@salesforce-executor/docs-index";

export class DocsCacheWriteError extends Data.TaggedError("DocsCacheWriteError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

type ProbeOk = { readonly ok: boolean; readonly status: number; readonly method: "HEAD" | "GET" };
type ProbeResult = ProbeOk | { readonly ok: false; readonly status: null; readonly error: string };

const probeUrl = (url: string): Effect.Effect<ProbeResult> =>
  Effect.gen(function* () {
    const headers: Record<string, string> = {
      "accept-encoding": "identity",
      "user-agent": "Salesforce Executor docs refresh",
    };

    const headExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => fetch(url, { method: "HEAD", headers }),
        catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
      }),
    );

    if (Exit.isSuccess(headExit) && headExit.value.ok) {
      return { ok: true, status: headExit.value.status, method: "HEAD" as const };
    }

    // Some official doc hosts return false negatives for HEAD while serving
    // the page normally. Use a small GET probe; never persist body text.
    const getExit = yield* Effect.exit(
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(url, {
            method: "GET",
            headers: { ...headers, range: "bytes=0-0" },
          });
          await res.body?.cancel();
          return res;
        },
        catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
      }),
    );

    if (Exit.isSuccess(getExit)) {
      return { ok: getExit.value.ok, status: getExit.value.status, method: "GET" as const };
    }
    const found = Cause.findError(getExit.cause);
    const failure = Result.isSuccess(found) ? found.success : "fetch failed";
    return { ok: false, status: null, error: failure };
  });

const cacheDir = ".cache/salesforce-docs-index";

export const docsRefreshEffect: Effect.Effect<
  {
    readonly cachePath: string;
    readonly count: number;
  },
  DocsCacheWriteError
> = Effect.gen(function* () {
  yield* Effect.tryPromise({
    try: () => mkdir(cacheDir, { recursive: true }),
    catch: (cause) => new DocsCacheWriteError({ path: cacheDir, cause }),
  });

  type ResultEntry = (typeof officialDocsIndex)[number] & {
    readonly ok: boolean;
    readonly status: number | null;
    readonly method?: "HEAD" | "GET";
    readonly error?: string;
    readonly checkedAt: string;
  };

  const results: ResultEntry[] = [];
  for (const doc of officialDocsIndex) {
    const probe = yield* probeUrl(doc.url);
    const checkedAt = new Date().toISOString();
    if ("error" in probe) {
      results.push({ ...doc, ok: false, status: probe.status, error: probe.error, checkedAt });
    } else {
      results.push({
        ...doc,
        ok: probe.ok,
        status: probe.status,
        method: probe.method,
        checkedAt,
      });
    }
  }

  const cachePath = `${cacheDir}/official-docs.json`;
  yield* Effect.tryPromise({
    try: () => writeFile(cachePath, `${JSON.stringify(results, null, 2)}\n`),
    catch: (cause) => new DocsCacheWriteError({ path: cachePath, cause }),
  });

  yield* Effect.sync(() => {
    console.log(`Wrote ${cachePath} with ${results.length} official doc entries.`);
  });

  return { cachePath, count: results.length };
});

/** Promise wrapper used by `scripts/salesforce/docs-refresh.ts`. */
export const docsRefresh = (): Promise<{ readonly cachePath: string; readonly count: number }> =>
  Effect.runPromise(docsRefreshEffect);
