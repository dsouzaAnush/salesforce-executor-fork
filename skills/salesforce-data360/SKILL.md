---
name: salesforce-data360
description: Use when working with Salesforce Data 360/Data Cloud through the Data 360 MCP facade, Data Cloud APIs, ingestion, data model objects, SQL, semantic search, retrievers, or activations.
---

# Salesforce Data 360

Use the local Data 360 MCP facade in this order:

1. `search` to find the right Data 360 tool family.
2. `payload_examples` to inspect schema and safe examples.
3. `execute` to call the selected `d360_*` tool.

Default read tools:

- Data model and data lake object list/get.
- SQL query examples and schema discovery.
- Data stream, connector, connection, segment, calculated insight, retriever, and search-index inventory.

Mutation rules:

- Treat ingestion, mapping, activation, publish, enable/disable, run, and delete as high risk.
- Use Executor approval policies for every mutating `execute` call.
- ADL remains a direct REST/API gap unless a native MCP family is exposed.

Existing local skill pack reference:

- Set `D360_CODEX_SKILLS_DIR` (or `D360_SKILLS_DIR`) to a local clone of the Data 360 Codex skill pack to expose its skills alongside the ones in this repo's `skills/` directory.

Hosted MCP complement:

- Use Data 360 Hosted SQL MCP for org-configured read-only SQL tools when the Salesforce org exposes `/data/data-cloud-queries`.
- Use Tableau Next MCP for governed semantic analytics over Data 360-backed datasets.
