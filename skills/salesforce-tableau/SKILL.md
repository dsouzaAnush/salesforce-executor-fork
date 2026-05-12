---
name: salesforce-tableau
description: Use when working with Tableau Next MCP, semantic models, metrics, dashboards, Analytics Q&A, governed analytics, or Salesforce-Tableau data workflows.
---

# Salesforce Tableau

Use official sources first:

- Tableau Next Hosted MCP for semantic models, metrics, KPIs, dashboards, and Analytics Q&A.
- Data 360 Hosted SQL MCP or local Data 360 MCP when analytics depends on Data Cloud data.
- Official Tableau and Salesforce Hosted MCP documentation for setup and permissions.

Default workflow:

1. Discover available Tableau Next semantic models and dashboards before answering business questions.
2. Prefer read-only Analytics Q&A, KPI, dashboard, and metric inspection.
3. Connect answers back to Data 360, Salesforce Core, or Heroku/MuleSoft operational data only when the source is clear.
4. Require approval before publishing, changing model definitions, or altering governed analytics configuration.

Useful checks:

- Hosted MCP Tableau Next docs.
- Data 360 SQL availability for underlying customer data.
- User permissions for Tableau Next and the connected Salesforce org.
