---
name: salesforce-agentforce
description: Use when working with Agentforce, Agentforce Vibes, Prompt Builder, hosted MCP custom servers, agent actions, or MCP client setup through Salesforce Executor.
---

# Salesforce Agentforce

Use official sources first:

- Salesforce Hosted MCP for Prompt Builder, Flow, Invocable Action, API Catalog, and custom server tools.
- Agentforce Vibes MCP client docs for IDE-side MCP tool configuration.
- Salesforce DX MCP and CLI for metadata, tests, and agent-adjacent org setup.

Default workflow:

1. Identify whether the task is agent design, prompt/template work, action exposure, or MCP client setup.
2. Prefer read-only discovery of published prompts, flows, invocable actions, and custom server definitions.
3. For action publication, metadata deploys, agent test runs, and org mutations, rely on Executor approval policies.
4. Keep tool boundaries explicit: Agentforce consumes MCP tools; Salesforce Executor aggregates and governs them.

Useful checks:

- Hosted MCP Prompt Builder and custom server docs.
- Salesforce DX MCP tools for agent tests and metadata.
- `sf org display --json` before any org-scoped setup.
