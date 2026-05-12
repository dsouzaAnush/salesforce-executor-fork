---
name: salesforce-mulesoft
description: Use when working with MuleSoft Anypoint Platform, MuleSoft MCP, APIs, Exchange assets, Runtime Manager, deployments, or anypoint-cli-v4 through Salesforce Executor.
---

# Salesforce MuleSoft

Use official sources first:

- MuleSoft MCP Server: `npx -y mulesoft-mcp-server start`
- Anypoint Connector for MCP when designing Mule apps that expose or consume MCP capabilities.
- Anypoint CLI v4.
- Official MuleSoft docs for Anypoint APIs and MCP connector.

Safe defaults:

- Start with organization, environment, asset, and API inventory.
- Confirm environment and business group before making changes.
- Require approval for deployments, policy changes, asset publication, runtime changes, and secret/connection updates.

Useful checks:

- `anypoint-cli-v4 --version`
- Anypoint org and environment listing through MCP or CLI.
