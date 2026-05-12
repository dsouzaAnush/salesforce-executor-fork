---
name: salesforce-heroku
description: Use when operating Heroku apps, pipelines, config, releases, dynos, add-ons, Platform API resources, or Heroku MCP through Salesforce Executor.
---

# Salesforce Heroku

Use official sources first:

- Remote MCP: `https://mcp.heroku.com/mcp`
- Local MCP: `heroku mcp:start`
- CLI: `heroku`
- API docs: Heroku Platform API reference.

Safe defaults:

- List apps, pipelines, releases, formations, add-ons, and config var names.
- Do not reveal config var values unless explicitly requested and approved.
- Require approval for deploys, config changes, dyno restarts/stops, add-on changes, and app deletion.

Useful checks:

- `heroku auth:whoami`
- `heroku apps --json`
- `heroku pipelines --json`
