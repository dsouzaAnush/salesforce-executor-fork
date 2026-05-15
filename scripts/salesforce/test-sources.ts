/**
 * `bun run test:sources` — registry invariant smoke runner. Delegates to
 * the canonical CLI library; pairs with the vitest-driven
 * `packages/salesforce-docs-index/src/registry.test.ts` invariants.
 */

import { testSources } from "../../apps/cli/src/cli/salesforce";

await testSources().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
