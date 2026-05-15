# Releasing Salesforce Executor

Salesforce Executor is internal-only today. There is no public npm release.
Teammates either clone this private repo and run from source, or install a
signed archive produced from `bun run --cwd apps/cli build:all` and attached
to a private GitHub Release on `dsouzaAnush/salesforce-executor`.

Design note: the CLI binary is named `executor` (same as upstream). This
fork **vendors** the upstream runtime and attaches Salesforce-specific
behavior via:

- A Salesforce-branded local app under `apps/local/src/salesforce/`.
- A curated source catalog at `packages/salesforce-docs-index/`.
- New `executor setup` and `executor doctor` subcommands implemented in
  `apps/cli/src/cli/salesforce/`.
- Local stdio MCP adapters at `adapters/cli-bridge/` and
  `adapters/informatica-idmc/`.

Renaming the binary to `salesforce-executor` would be misleading (the
runtime IS upstream executor) and would create unnecessary diff against
upstream for every future sync. Internal teammates know the product is
Salesforce Executor; the binary they invoke is just `executor`.

---

## Verification gates

Before publishing any internal artifact, run the full gate locally from the
repo root:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:sources
bun run test:release:bootstrap
```

`test:sources` is the Salesforce registry smoke runner. `test:release:bootstrap`
builds the single-platform binary, exposes it from a temporary npm-install
layout, and confirms `executor --help` and `executor web` both work
end-to-end. Both are also wired into `.github/workflows/ci.yml`.

For a Salesforce-overlay PR (only `packages/salesforce-docs-index`,
`adapters/`, `scripts/salesforce/`, `apps/cli/src/cli/salesforce/`,
`apps/local/src/salesforce/`, or `skills/` touched) the narrower gate
`bun run --cwd packages/salesforce-docs-index test && bun run typecheck` is
sufficient locally, but CI will still run the full set.

---

## Path 1 — clone-and-run (default)

For internal teammates who want to track `main` and reach into the source.

1. They clone the private repo:

   ```bash
   git clone git@github.com:dsouzaAnush/salesforce-executor.git
   cd salesforce-executor
   bun install
   ```

2. They start the local app:

   ```bash
   bun run dev:salesforce
   ```

3. They register sources via the dev CLI:

   ```bash
   bun run dev:cli -- doctor
   bun run dev:cli -- setup --profile full --org "$SF_TARGET_ORG"
   ```

No release process is needed for this path beyond merging to `main`.

---

## Path 2 — signed archive on a private GitHub Release

For internal teammates who want a single installable binary without the
monorepo. Run this on demand; we don't auto-tag.

### Pre-flight

```bash
git checkout main
git pull --ff-only
bun install --frozen-lockfile
bun run release:check
```

`release:check` runs `apps/cli typecheck`, `test:release:bootstrap`, and the
single-platform `release:publish:dry-run` build. The dry-run produces the
release artifacts under `apps/cli/dist/` so you can sanity-check sizes and
file lists before tagging.

### Tag and build

Pick a version that does not collide with the upstream Executor cadence —
the convention is `v<n>-sfdc-<m>` (for example `v1-sfdc-0`, `v1-sfdc-1`).
Salesforce Executor versions are independent from upstream's semver and are
not visible to npm.

```bash
version="1-sfdc-0"
git tag "v${version}"
git push origin "v${version}"

EXECUTOR_VERSION="$version" bun run --cwd apps/cli build:all
```

`build:all` produces 8 platform archives under
`apps/cli/dist/executor-<plat>-<arch>/bin/` plus the
`apps/cli/dist/executor/` npm wrapper (kept for local testing — not
published).

### Package the release assets

```bash
bun run --cwd apps/cli bun run src/build.ts release-assets
ls apps/cli/dist/executor-*.{tar.gz,zip}
```

Each platform produces one archive containing the binary, the QuickJS WASM
sidecar, and the platform keyring binding.

### Create the private GitHub Release

```bash
gh release create "v${version}" \
  apps/cli/dist/executor-*.tar.gz \
  apps/cli/dist/executor-*.zip \
  --repo dsouzaAnush/salesforce-executor \
  --title "v${version}" \
  --notes-file apps/cli/release-notes/next.md \
  --verify-tag
```

Internal teammates can then install with:

```bash
curl -fsSL https://raw.githubusercontent.com/dsouzaAnush/salesforce-executor/main/scripts/install.sh \
  | VERSION="${version}" bash
```

`scripts/install.sh` downloads the right archive for their platform into
`~/.executor/bin/` and patches `$PATH` in their shell config. (The install
dir keeps the upstream `.executor` name since the binary IS upstream
executor; only the source catalog and subcommands are Salesforce-specific.)

### Release notes

`apps/cli/release-notes/next.md` is the single rolling source of truth.
Replace it before each tag — its previous contents are preserved on the
matching GitHub Release page.

---

## What is intentionally not part of the release flow

- **No npm publish.** `apps/cli/package.json` is `"private": true` and every
  `@executor-js/*` library `package.json` is also marked private. The
  upstream-shaped `release.yml`, `publish-executor-package.yml`,
  `pkg-pr-new.yml`, and `publish-desktop.yml` workflows were deleted as
  part of the fork bootstrap (see `git log`).
- **No CLI rename.** The binary stays `executor`. Internal users
  distinguish the fork by the GitHub repo URL
  (`dsouzaAnush/salesforce-executor`), the Salesforce-branded local app,
  the `setup`/`doctor` subcommands (upstream doesn't have those), and the
  curated source catalog. Renaming the binary would mislead users about
  what the runtime is and bloat the diff vs upstream.
- **No Changesets-driven release PRs.** `.changeset/config.json` still
  exists for tracking purposes, but no automated PR opens because the
  `Release` workflow that drove it is gone.
- **No desktop / cloud / marketing builds.** Those apps still live in
  `apps/desktop`, `apps/cloud`, `apps/marketing` to keep `sync-upstream.sh`
  cheap, but they're not part of the Salesforce internal release surface.

If any of those are needed later, the patterns above translate
straightforwardly — but flip them on intentionally rather than by accident.
