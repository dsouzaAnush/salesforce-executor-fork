/**
 * `bun run doctor:salesforce` — thin wrapper around the canonical CLI
 * surface in `apps/cli/src/cli/salesforce/doctor.ts`. The same code is
 * reachable from the packaged CLI as `salesforce-executor doctor`.
 */

import { doctor } from "../../apps/cli/src/cli/salesforce";

await doctor().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
