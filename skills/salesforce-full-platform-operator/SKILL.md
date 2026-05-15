---
name: salesforce-full-platform-operator
description: Use for cross-product Salesforce-family operations spanning Salesforce Core, Agentforce, Data 360, Tableau Next, Heroku, MuleSoft, Slack, and Informatica with full-platform Executor sources.
---

# Salesforce Full Platform Operator

Coordinate across products with this sequence:

1. Identify the target product, account/org/workspace, and source namespace.
2. Discover tools and docs before invoking mutating actions.
3. Prefer official MCP/API/CLI sources; clearly label local adapters.
4. For risky actions, summarize blast radius and let Executor approval policies pause execution.
5. Record which source, org/workspace/account, and tool performed the action.

High-risk actions include:

- Deletes, deploys, publishes, activations, config-var writes, Slack sends, job starts/stops, runtime changes, user/role changes, and external system writes.
- Agentforce action publication, SObject mutations/deletes, semantic model changes, prompt publication, and custom Hosted MCP server changes.

Never commit or print tokens, session IDs, refresh tokens, OAuth client secrets, signing secrets, or private keys.
