/**
 * `bun run setup:salesforce` — thin wrapper around the canonical CLI surface
 * in `apps/cli/src/cli/salesforce/setup.ts`. The same code is reachable from
 * the packaged CLI as `salesforce-executor setup`.
 */

import { setup, type SetupOptions } from "../../apps/cli/src/cli/salesforce";

const parseArgs = (argv: ReadonlyArray<string>): SetupOptions => {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value?.startsWith("--")) continue;
    const stripped = value.slice(2);
    const eqIndex = stripped.indexOf("=");
    if (eqIndex >= 0) {
      const key = stripped.slice(0, eqIndex);
      const inline = stripped.slice(eqIndex + 1);
      out[key] = inline.length === 0 ? true : inline;
      continue;
    }
    const key = stripped;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return {
    profile: typeof out.profile === "string" ? out.profile : undefined,
    only: typeof out.only === "string" ? out.only : undefined,
    org: typeof out.org === "string" ? out.org : undefined,
  };
};

const summary = await setup(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

if (summary && summary.outcomes.some((outcome) => outcome.status === "failed")) {
  process.exit(1);
}
