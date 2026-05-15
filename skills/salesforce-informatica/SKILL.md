---
name: salesforce-informatica
description: Use when working with Informatica IDMC, official IDMC REST APIs, assets, runtime environments, Cloud Data Integration jobs, or Salesforce-Informatica integration planning.
---

# Salesforce Informatica

No official Informatica MCP server is currently registered in this repo. Use the local `informatica-idmc-api` adapter only as an official-API local adapter over documented IDMC REST APIs.

Safe defaults:

- Start with API family discovery and credential status.
- Require approval for job runs, asset changes, deletes, user changes, runtime changes, and connection updates.
- Keep base URLs, session IDs, and bearer tokens in Executor secrets or `.env.local`.

Useful environment:

- `INFORMATICA_BASE_URL`
- `INFORMATICA_SESSION_ID`
- `INFORMATICA_BEARER_TOKEN`
