# scripts/salesforce

Thin `bun run` wrappers around the canonical Salesforce CLI library at
[`apps/cli/src/cli/salesforce`](../../apps/cli/src/cli/salesforce/). Each
wrapper exists so a developer can run the same surface that
`salesforce-executor setup`, `salesforce-executor doctor`, etc. expose from
the packaged binary, without having to build it first.

| Script            | Equivalent CLI                       | Effect entry point                                                       |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `setup.ts`        | `salesforce-executor setup …`        | [`setupEffect`](../../apps/cli/src/cli/salesforce/setup.ts)              |
| `doctor.ts`       | `salesforce-executor doctor`         | [`doctorEffect`](../../apps/cli/src/cli/salesforce/doctor.ts)            |
| `docs-refresh.ts` | _(internal, no CLI subcommand yet)_  | [`docsRefreshEffect`](../../apps/cli/src/cli/salesforce/docs-refresh.ts) |
| `test-sources.ts` | _(internal, paired with the vitest)_ | [`testSourcesEffect`](../../apps/cli/src/cli/salesforce/test-sources.ts) |

Compose each via the `package.json#scripts` aliases at the repo root:

```bash
bun run setup:salesforce -- --profile full --org "$SF_TARGET_ORG"
bun run doctor:salesforce
bun run docs:refresh
bun run test:sources
```

## Why a thin wrapper instead of `bun run apps/cli/src/main.ts setup`?

History: the scripts predate the CLI subcommand wiring. We kept them as
the developer-friendly entry point because:

1. They preserve the `bun run setup:salesforce -- --profile <x>` muscle
   memory documented in the README and the install scripts.
2. They surface clearer non-zero exit codes than `Command.run` does for
   the no-org-supplied case.
3. `setup.ts` carries a tiny CLI arg parser tolerant of both
   `--key value` and `--key=value` styles — closer to user expectations
   than the strict Effect CLI subcommand options.

The body of each wrapper is one line — it calls into the canonical Effect
entry point in `apps/cli/src/cli/salesforce/`. If you need to change the
behavior, edit the library function; the wrapper rarely needs to change.

## Environment

| Variable                   | Used by                     | Purpose                                                                                                                                                        |
| -------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SALESFORCE_EXECUTOR_ROOT` | setup, test-sources         | Override the repo root used when expanding `${SALESFORCE_EXECUTOR_ROOT}` tokens in source configs. Defaults to the resolved repo root from the CLI's location. |
| `EXECUTOR_URL`             | setup, doctor, test-sources | Target Executor daemon URL. Defaults to `http://localhost:4788`.                                                                                               |
| `SF_TARGET_ORG`            | setup                       | Fallback when `--org` is not passed.                                                                                                                           |
| `D360_ORG_ALIAS`           | setup                       | Higher-priority fallback for `--org`.                                                                                                                          |
| `SF_ORGS`                  | setup                       | Substituted into the Salesforce DX MCP `--orgs` argument template.                                                                                             |
| `D360_CODEX_PLUGIN_ROOT`   | setup, doctor               | Root of the Data 360 Codex plugin clone. When unset, `data360-mcp` is silently skipped.                                                                        |
| `D360_MCP_JAR`             | doctor                      | Path to a pre-built Data 360 MCP server jar.                                                                                                                   |
| `D360_MCP_REPO`            | doctor                      | Path to the Data 360 MCP server repo (used to compute `D360_MCP_JAR` if unset).                                                                                |
| `INFORMATICA_BASE_URL`     | informatica adapter         | IDMC region base URL (https-required).                                                                                                                         |
| `INFORMATICA_BEARER_TOKEN` | informatica adapter         | OAuth bearer for IDMC.                                                                                                                                         |
| `INFORMATICA_SESSION_ID`   | informatica adapter         | Legacy `INFA-SESSION-ID` header.                                                                                                                               |

`.env.example` documents the canonical list with empty defaults; copy it to
`.env.local` and fill in machine-specific values.

## Tests

`scripts/salesforce/test-sources.ts` runs cross-package invariants that
`packages/salesforce-docs-index/src/registry.test.ts` cannot see (env-token
substitution, `executor.jsonc` token absence, daemon smoke). The vitest
itself runs from `bun run test:sources` too.

`tests/setup-profile.test.ts` exercises the setup flow end-to-end against a
stub HTTP server so a registry change that breaks the registration path is
caught in CI without needing a live daemon.
