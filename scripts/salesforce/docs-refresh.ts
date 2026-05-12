/**
 * `bun run docs:refresh` — refresh the cached probe state for
 * `officialDocsIndex`. Delegates to the canonical CLI library.
 */

import { docsRefresh } from "../../apps/cli/src/cli/salesforce";

await docsRefresh().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
