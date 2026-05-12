---
name: salesforce-core
description: Use when working with Salesforce core platform orgs, metadata, SObjects, Apex, flows, invocable actions, hosted MCP, or the Salesforce CLI through Salesforce Executor.
---

# Salesforce Core

Use official sources first:

- Salesforce DX MCP for local CLI-backed org work.
- Salesforce Hosted MCP for org-configured SObject Reads, SObject All, SObject Mutations, SObject Deletes, API Catalog, Flows, Invocable Actions, Prompt Builder, Data 360, and Tableau Next.
- Salesforce CLI (`sf`) for org/session/metadata tasks.
- Official REST, Metadata, Tooling, and API Catalog docs for API planning.

Default workflow:

1. Discover the current org and available source tools.
2. Prefer read-only metadata/SObject inspection before changing anything.
3. For create/update/delete/deploy/publish actions, explain the target org and object first, then rely on Executor approval policies.
4. Never print access tokens, refresh tokens, client secrets, or session IDs.

Useful checks:

- `sf org list --json`
- `sf org display --json`
- Hosted MCP source tools for SObject metadata, SOQL/SOSL, Flow discovery, Invocable Actions, Prompt Builder, and custom servers.
