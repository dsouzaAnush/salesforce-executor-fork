# Salesforce Executor

Private review fork of [Executor](https://github.com/RhysSullivan/executor)
for Salesforce-family agent tooling.

Salesforce Executor turns Executor into a local control plane for
Salesforce Core, Agentforce, Data 360, Tableau Next, Heroku, MuleSoft,
Slack, and Informatica. It curates official MCP servers, API surfaces,
CLI bridges, docs links, and local Codex skills behind one source
catalog that can be shared with Claude Code, Cursor, Codex, and other
MCP clients.

This repo is a private review/dev checkout that runs from source. There
is no public npm release; the fork keeps the upstream `executor` binary
name and attaches Salesforce-specific behavior via a curated source
catalog, `executor setup` / `executor doctor` subcommands, a
Salesforce-branded local app, and local stdio MCP adapters.

---

## What this repo adds

- Salesforce-branded local Executor app at `http://127.0.0.1:4788`.
- Curated Salesforce-family source registry in `packages/salesforce-docs-index`.
- Setup, doctor, docs-refresh, and registry-validation scripts under
  `scripts/salesforce/`.
- Local MCP bridge adapters for Salesforce-family CLIs and Informatica
  IDMC REST APIs (`adapters/cli-bridge`, `adapters/informatica-idmc`).
- Data 360 MCP launcher that reads local `sf` CLI auth at startup
  without persisting org access tokens.
- Codex skill pack in `skills/` for Salesforce Core, Data 360, Heroku,
  MuleSoft, Slack, Informatica, Agentforce, and Tableau.
- Approval-oriented policy defaults for destructive, externally
  visible, or deployment-style tool calls.

---

## Prerequisites

You will need:

- **Bun ≥ 1.3.11** — `curl -fsSL https://bun.sh/install | bash`
- **Node.js ≥ 24** — only used by some toolchains; Bun handles runtime.
- **Java 17+** — required by the Data 360 MCP launcher (skip if you
  don't plan to use Data 360 sources).
- **Salesforce CLI (`sf`)** — required by the DX MCP and CLI Bridge
  sources. Install via [Salesforce CLI docs](https://developer.salesforce.com/tools/salesforce-cli)
  and authenticate at least one org (`sf org login web`).
- _(optional)_ **Heroku CLI**, **`anypoint-cli-v4`**, **Slack CLI** —
  enable the corresponding CLI Bridge tools.

Run `bun run doctor:salesforce` after install to see which of the
above the current shell is missing.

---

## Install

```bash
git clone https://github.com/dsouzaAnush/salesforce-executor.git
cd salesforce-executor
bun install
cp .env.example .env.local
```

Edit `.env.local` to point at your local Salesforce orgs and (when
needed) the Data 360 / Informatica paths. See
[`.env.example`](./.env.example) for the full list.

`.env.local`, `.env`, and `executor.jsonc` are all gitignored.

---

## Run

Start the local Salesforce Executor UI:

```bash
bun run dev:salesforce
```

Open `http://127.0.0.1:4788`. The UI can boot with no Salesforce
credentials. Live source registration only happens when you run setup.

In another shell, register sources against the running app:

```bash
bun run doctor:salesforce
bun run setup:salesforce -- --profile full --org "$SF_TARGET_ORG"
```

`setup:salesforce` is idempotent. Sources whose external prerequisite
is missing (e.g. `D360_CODEX_PLUGIN_ROOT` unset) are skipped with a
clear message instead of being registered with a broken launcher.

`--profile` accepts:

| Profile | Sources                                                                  |
| ------- | ------------------------------------------------------------------------ |
| `core`  | Salesforce platform only (DX MCP, CLI bridge, hosted MCP doc references) |
| `data`  | Data 360 / Data Cloud focused                                            |
| `full`  | Every registry source that has an executor config                        |

Targeted setups also work:

```bash
bun run setup:salesforce -- --only data360-mcp --org "$D360_ORG_ALIAS"
bun run setup:salesforce -- --only salesforce-family-cli-bridge --org "$SF_TARGET_ORG"
```

---

## Connect Claude Code or Cursor

The packaged CLI binary is `executor` — this fork vendors the upstream
runtime rather than renaming it. The Salesforce-specific surface attaches
via the curated source catalog, the Salesforce-branded local app, and the
`executor setup` / `executor doctor` subcommands. From a clone-and-run
setup, use the development entry point (`bun run dev:cli -- ...`); from a
downloaded release archive (see [`RELEASING.md`](./RELEASING.md)), use
`executor` directly.

```bash
# From a clone:
export SALESFORCE_EXECUTOR_ROOT="$(pwd)"
npx add-mcp \
  "bun run dev:cli -- mcp --scope ${SALESFORCE_EXECUTOR_ROOT}/apps/local" \
  --name "salesforce-executor"

# From a packaged binary:
npx add-mcp "executor mcp" --name "salesforce-executor"
```

Manual MCP config from a clone (substitute `<repo-root>` with the absolute
path):

```json
{
  "mcpServers": {
    "salesforce-executor": {
      "command": "bash",
      "args": ["-lc", "cd <repo-root> && bun run dev:cli -- mcp --scope <repo-root>/apps/local"]
    }
  }
}
```

From a packaged binary, the manual MCP config is one line:

```json
{
  "mcpServers": {
    "salesforce-executor": { "command": "executor", "args": ["mcp"] }
  }
}
```

The MCP client-side label (`salesforce-executor`) is intentional — that's
the name your agents (Claude, Cursor, Codex) see in their MCP server list.
The local OS binary is still `executor`.

---

## Source model

Executor has native runtime support for:

- MCP sources
- OpenAPI sources
- GraphQL sources
- Google Discovery sources

Salesforce Executor uses those runtime source types directly where
possible. CLI, docs, and skills are handled as follows:

- **CLIs** are exposed through local MCP bridge adapters
  (`adapters/cli-bridge`).
- **Docs** are catalog references and optional cached metadata, not
  live tools by themselves.
- **Skills** are agent guidance files in `skills/` that teach Codex
  and other agents how to use the live tools safely.
- **Informatica** is a local adapter over official IDMC REST APIs
  because no official Informatica MCP server is registered yet.

---

## Included Salesforce-family sources

- Salesforce DX MCP
- Salesforce Hosted MCP server references (SObject Reads / All /
  Mutations / Deletes; API Catalog, Flows, Invocable Actions, Prompt
  Builder, Custom Servers)
- Salesforce GraphQL API (`/services/data/vXX.X/graphql`)
- Agentforce Vibes MCP client docs
- B2C Commerce DX MCP (Developer Preview)
- Data 360 local MCP and Hosted SQL MCP
- Tableau Next MCP and Tableau MCP (Cloud / Server)
- Heroku MCP (remote OAuth + local stdio variant)
- MuleSoft MCP server + Anypoint Connector for MCP docs
- Slack MCP
- Informatica IDMC REST API adapter
- Salesforce Family CLI Bridge
- Salesforce official docs index
- Salesforce Codex skill pack

The full registry lives in
[`packages/salesforce-docs-index/src/registry.ts`](./packages/salesforce-docs-index/src/registry.ts).

---

## Environment

Per-machine values belong in `.env.local`, which is gitignored.

| Variable                                              | Used for                                     |
| ----------------------------------------------------- | -------------------------------------------- |
| `SF_TARGET_ORG` / `D360_ORG_ALIAS`                    | Salesforce CLI-backed sources                |
| `SF_ORGS`                                             | Optional Salesforce DX MCP `--orgs` value    |
| `D360_CODEX_PLUGIN_ROOT`                              | Local Data 360 Codex plugin clone            |
| `D360_MCP_REPO` / `D360_MCP_JAR`                      | Local Data 360 MCP server jar / source       |
| `INFORMATICA_BASE_URL`                                | IDMC region base URL                         |
| `INFORMATICA_BEARER_TOKEN` / `INFORMATICA_SESSION_ID` | IDMC auth                                    |
| `EXECUTOR_URL`                                        | Override `http://localhost:4788` for scripts |
| `SALESFORCE_EXECUTOR_ROOT`                            | Override repo root used in launcher paths    |

---

## Commands

From a clone (development):

| Goal                           | Command                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| Start Salesforce Executor UI   | `bun run dev:salesforce`                                       |
| Probe local prerequisites      | `bun run doctor:salesforce`                                    |
| Register full source set       | `bun run setup:salesforce -- --profile full --org <alias>`     |
| Register Data 360 only         | `bun run setup:salesforce -- --only data360-mcp --org <alias>` |
| Refresh official docs metadata | `bun run docs:refresh`                                         |
| Validate source registry       | `bun run test:sources`                                         |
| Type-check                     | `bun run typecheck`                                            |
| Lint + format check            | `bun run lint && bun run format:check`                         |
| Full test suite                | `bun run test`                                                 |
| Release bootstrap smoke test   | `bun run test:release:bootstrap`                               |

From a packaged binary (the binary is `executor` — the fork keeps the
upstream name and attaches Salesforce behavior via the curated registry
and `setup`/`doctor` subcommands):

| Goal                         | Command                                           |
| ---------------------------- | ------------------------------------------------- |
| Start Salesforce Executor UI | `executor web`                                    |
| Probe local prerequisites    | `executor doctor`                                 |
| Register full source set     | `executor setup --profile full --org <alias>`     |
| Register Data 360 only       | `executor setup --only data360-mcp --org <alias>` |
| Start MCP server over stdio  | `executor mcp`                                    |
| Invoke a tool by path        | `executor call <namespace> <path> '<json>'`       |

---

## Verification before sharing

```bash
bun run typecheck
bun run lint
bun run format:check
bun run test:sources
bun run test:release:bootstrap
```

Also confirm no org session tokens, OAuth tokens, `.env.local`,
generated credentials, or local `executor.jsonc` secrets are tracked
by git:

```bash
git ls-files | grep -E '(\.env(\..+)?$|^executor\.jsonc$|\.DS_Store)' \
  || echo "clean"
```

---

## Distribution plan

This repo is private on GitHub and currently distributed two ways
(see [`RELEASING.md`](./RELEASING.md)):

1. **Clone-and-run** — internal teammates clone the repo and run
   `bun run dev:salesforce`. Default for development.
2. **Private GitHub Release** — `bun run --cwd apps/cli build:all`
   produces platform archives (`executor-<plat>-<arch>.tar.gz`) that are
   attached to a private GitHub Release on `dsouzaAnush/salesforce-executor`.
   Teammates install via [`scripts/install.sh`](./scripts/install.sh).

Design decision: we keep the upstream `executor` CLI binary as-is and
attach Salesforce-specific behavior via the curated source catalog, the
Salesforce-branded local app, and `executor setup` / `executor doctor`
subcommands. This is honest (the binary IS upstream executor with an
overlay) and keeps the diff against upstream small for future syncs.

Status of the original distribution checklist:

- [x] **Keep** the upstream `executor` binary; attach Salesforce-specific
      behavior (setup/doctor subcommands, registry, branded UI) without
      renaming the underlying CLI. Trade-off: internal users need to know
      the binary is `executor`, not `salesforce-executor`. The
      install/setup output, README, and MCP client label all make the
      Salesforce framing obvious.
- [x] Keep upstream Executor attribution and remote separate — see
      [`NOTICE`](./NOTICE) and [`UPSTREAM_BASE`](./UPSTREAM_BASE).
- [x] First-run flow works as documented:

      ```bash
      executor web
      executor setup --profile full --org <alias>
      executor mcp
      ```

- [ ] Publish to a private/scoped npm registry. Not required for
      internal use; flip on when an external team wants pinned
      installs. All `@executor-js/*` library packages are currently
      marked `"private": true`; flip them to public only when
      republishing under a scoped name.
- [ ] Sign macOS binaries. Optional — Gatekeeper will quarantine
      unsigned archives until first run.

---

## Upstream

This project is a true git fork of
[RhysSullivan/executor](https://github.com/RhysSullivan/executor).
Upstream Executor is MIT licensed and provides the core local runtime,
source plugin model, web UI, CLI, MCP host, policy system, and
packaging pipeline.

Salesforce-specific code lives entirely as overlay files committed on
top of `main`:

- `packages/salesforce-docs-index/` — curated source registry
- `apps/local/public/salesforce-logos/`, `apps/local/src/salesforce/`,
  the two `routes/{sources,source-manager}.tsx` files, and the minimal
  delta in `apps/local/src/web/shell.tsx` (Salesforce brand, nav, and
  registry-aware sidebar list)
- `apps/cli/src/cli/salesforce/` — `executor setup` and
  `executor doctor` subcommands wired into `apps/cli/src/main.ts`
- `adapters/cli-bridge/`, `adapters/informatica-idmc/`
- `scripts/salesforce/`, `scripts/run-*` launchers, root
  `dev:salesforce` / `doctor:salesforce` / `setup:salesforce` /
  `docs:refresh` / `test:sources` scripts
- `skills/salesforce-*`

To pull newer upstream changes:

```bash
git remote add upstream https://github.com/RhysSullivan/executor   # one-time
git fetch upstream
git rebase upstream/main
```

If a conflict appears it is localized to the overlay files listed
above; everything else is taken from upstream verbatim.
