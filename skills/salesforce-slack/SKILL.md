---
name: salesforce-slack
description: Use when working with Slack MCP, Slack Web API, Slack CLI, workspace search, channels, messages, workflows, or Salesforce-Slack operational automation.
---

# Salesforce Slack

Use official sources first:

- Slack remote MCP: `https://mcp.slack.com/mcp`
- Slack Web API docs.
- Slack CLI.

Safe defaults:

- Read channels, users, app config, and search results first.
- Require approval before posting messages, updating channels, inviting users, changing app config, or triggering workflows.
- Never expose tokens, signing secrets, bot tokens, app tokens, or channel-private data unless explicitly approved.

Useful checks:

- `slack auth list`
- Slack MCP channel and search tools.
