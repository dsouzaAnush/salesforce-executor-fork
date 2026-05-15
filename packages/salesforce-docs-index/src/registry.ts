export type SalesforceSourceKind =
  | "mcp-remote"
  | "mcp-stdio"
  | "openapi"
  | "graphql"
  | "cli-bridge"
  | "docs"
  | "skill-pack"
  | "local-adapter";

export type SalesforceOfficialStatus =
  | "official"
  | "official-api-local-adapter"
  | "official-docs-only"
  | "community-optional";

export type SalesforcePolicyProfile = "read-first" | "approval-required" | "full-platform";

export type ExecutorMcpSourceConfig =
  | {
      readonly transport: "remote";
      readonly name: string;
      readonly namespace: string;
      readonly endpoint: string;
      readonly remoteTransport?: "streamable-http" | "sse" | "auto";
      readonly auth?:
        | { readonly kind: "none" }
        | {
            readonly kind: "oauth2";
            readonly connectionId: string;
            readonly clientIdSecretId?: string;
            readonly clientSecretSecretId?: string | null;
          };
    }
  | {
      readonly transport: "stdio";
      readonly name: string;
      readonly namespace: string;
      readonly command: string;
      readonly args?: readonly string[];
      readonly cwd?: string;
      readonly env?: Readonly<Record<string, string>>;
    };

export type ExecutorOpenApiSourceConfig = {
  readonly kind: "openapi";
  readonly name: string;
  readonly namespace: string;
  readonly spec: string;
  readonly baseUrl?: string;
};

export type SalesforceSourceDefinition = {
  readonly id: string;
  readonly vendor: "Salesforce" | "Heroku" | "MuleSoft" | "Slack" | "Informatica";
  readonly product: string;
  readonly kind: SalesforceSourceKind;
  readonly officialStatus: SalesforceOfficialStatus;
  readonly docsUrl: string;
  readonly authProfile: string;
  readonly install: readonly string[];
  readonly executorSourceConfig?: ExecutorMcpSourceConfig | ExecutorOpenApiSourceConfig;
  readonly policyProfile: SalesforcePolicyProfile;
  readonly skills: readonly string[];
  readonly demoPrompts: readonly string[];
};

/**
 * Path tokens used in `executorSourceConfig` entries below. Resolved at setup
 * time by `scripts/salesforce/lib.ts#substituteEnvTokens` from environment
 * variables, so no machine-specific absolute path lives in the registry.
 *
 * - `${SALESFORCE_EXECUTOR_ROOT}` resolves to this checkout's repo root.
 * - `${D360_CODEX_PLUGIN_ROOT}` resolves to a local clone of the Data 360
 *   Codex plugin (Data 360 source is skipped at setup time when unset).
 */
const repoRootToken = "${SALESFORCE_EXECUTOR_ROOT}";
const data360PluginRootToken = "${D360_CODEX_PLUGIN_ROOT}";

export const salesforceSourceRegistry: readonly SalesforceSourceDefinition[] = [
  {
    id: "salesforce-official-docs",
    vendor: "Salesforce",
    product: "Salesforce Official Docs Index",
    kind: "docs",
    officialStatus: "official-docs-only",
    docsUrl: "https://developer.salesforce.com/docs/",
    authProfile:
      "No auth; indexes official Salesforce-family documentation URLs without committing scraped page bodies.",
    install: ["bun run docs:refresh"],
    policyProfile: "read-first",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Open the official docs registry.",
      "Refresh docs metadata into .cache without storing doc bodies.",
    ],
  },
  {
    id: "salesforce-codex-skills",
    vendor: "Salesforce",
    product: "Salesforce Codex Skill Pack",
    kind: "skill-pack",
    officialStatus: "official-api-local-adapter",
    docsUrl: "https://developer.salesforce.com/docs/",
    authProfile: "No auth; local Codex skills guide official MCP, CLI, and API usage.",
    install: [
      "Use skills/ from this repo",
      "Set D360_CODEX_SKILLS_DIR to a local clone of the Data 360 Codex skill pack to expose its skills",
    ],
    policyProfile: "read-first",
    skills: [
      "salesforce-core",
      "salesforce-data360",
      "salesforce-agentforce",
      "salesforce-tableau",
      "salesforce-heroku",
      "salesforce-mulesoft",
      "salesforce-slack",
      "salesforce-informatica",
      "salesforce-full-platform-operator",
    ],
    demoPrompts: [
      "Show all Salesforce-family skill files.",
      "Explain when to use the full platform operator skill.",
    ],
  },
  {
    id: "salesforce-dx-mcp",
    vendor: "Salesforce",
    product: "Salesforce DX MCP",
    kind: "mcp-stdio",
    officialStatus: "official",
    docsUrl: "https://github.com/salesforcecli/mcp",
    authProfile: "Uses the local Salesforce CLI orgs and DEFAULT_TARGET_ORG when SF_ORGS is unset.",
    install: [
      "npm install -g @salesforce/cli",
      "sf org login web",
      "npx -y @salesforce/mcp --help",
    ],
    executorSourceConfig: {
      transport: "stdio",
      name: "Salesforce DX MCP",
      namespace: "salesforce-dx",
      command: "npx",
      args: [
        "-y",
        "@salesforce/mcp",
        "--orgs",
        "${SF_ORGS:-DEFAULT_TARGET_ORG}",
        "--toolsets",
        "all",
        "--allow-non-ga-tools",
      ],
      env: {
        SF_ORGS: "${SF_ORGS:-DEFAULT_TARGET_ORG}",
      },
    },
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List available orgs and describe the default target org.",
      "Show metadata for Account without modifying the org.",
    ],
  },
  {
    id: "salesforce-hosted-mcp",
    vendor: "Salesforce",
    product: "Salesforce Hosted MCP Servers",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/servers-reference.html",
    authProfile:
      "Salesforce org-configured remote MCP with OAuth; endpoint is org and server specific.",
    install: [
      "Configure hosted MCP in the Salesforce org",
      "Paste the org-specific MCP endpoint into Executor",
    ],
    policyProfile: "full-platform",
    skills: [
      "salesforce-core",
      "salesforce-agentforce",
      "salesforce-data360",
      "salesforce-tableau",
    ],
    demoPrompts: [
      "Discover SObject tools exposed by Hosted MCP.",
      "List available Flow and Invocable Action tool families.",
    ],
  },
  {
    id: "salesforce-hosted-sobject-reads",
    vendor: "Salesforce",
    product: "Hosted SObject Reads MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-reads.html",
    authProfile:
      "Salesforce Hosted MCP OAuth; read-only object schema, SOQL, SOSL, and recent records.",
    install: ["Use endpoint /platform/sobject-reads from a Salesforce org with Hosted MCP enabled"],
    policyProfile: "read-first",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List queryable Salesforce objects.",
      "Run a read-only SOQL query through Hosted MCP.",
    ],
  },
  {
    id: "salesforce-hosted-sobject-all",
    vendor: "Salesforce",
    product: "Hosted SObject All MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-all.html",
    authProfile: "Salesforce Hosted MCP OAuth; full SObject CRUD subject to user permissions.",
    install: ["Use endpoint /platform/sobject-all from a Salesforce org with Hosted MCP enabled"],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Inspect available CRUD tools for Account.",
      "Explain which SObject actions require approval.",
    ],
  },
  {
    id: "salesforce-hosted-sobject-mutations",
    vendor: "Salesforce",
    product: "Hosted SObject Mutations MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/sobject-mutations.html",
    authProfile:
      "Salesforce Hosted MCP OAuth; create, update, and upsert tools for objects the user can mutate.",
    install: [
      "Use endpoint /platform/sobject-mutations from a Salesforce org with Hosted MCP enabled",
    ],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Inspect SObject mutation tools exposed by the org.",
      "Explain approval boundaries before creating or updating records.",
    ],
  },
  {
    id: "salesforce-hosted-sobject-deletes",
    vendor: "Salesforce",
    product: "Hosted SObject Deletes MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/sobject-deletes.html",
    authProfile: "Salesforce Hosted MCP OAuth; delete tools for objects the user can delete.",
    install: [
      "Use endpoint /platform/sobject-deletes from a Salesforce org with Hosted MCP enabled",
    ],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List delete-capable SObject tools.",
      "Explain what confirmation is required before deleting records.",
    ],
  },
  {
    id: "salesforce-hosted-api-catalog",
    vendor: "Salesforce",
    product: "Hosted API Catalog MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/api-catalog.html",
    authProfile: "Salesforce Hosted MCP OAuth; exposes selected Salesforce REST APIs as tools.",
    install: ["Configure API Catalog-backed tools in Salesforce Setup"],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List API Catalog tools exposed by the org.",
      "Describe the approval risk for a selected REST operation.",
    ],
  },
  {
    id: "salesforce-hosted-flows",
    vendor: "Salesforce",
    product: "Hosted Flows MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/flows.html",
    authProfile: "Salesforce Hosted MCP OAuth; exposes selected autolaunched Flows.",
    install: ["Publish Flow-backed tools through Salesforce Hosted MCP custom server setup"],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List exposed Flow tools.",
      "Check whether a Flow action is read-only or mutating.",
    ],
  },
  {
    id: "salesforce-hosted-invocable-actions",
    vendor: "Salesforce",
    product: "Hosted Invocable Actions MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/invocable-actions.html",
    authProfile: "Salesforce Hosted MCP OAuth; exposes selected Apex @InvocableMethod actions.",
    install: ["Publish Apex Action-backed tools through Salesforce Hosted MCP custom server setup"],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List exposed Invocable Action tools.",
      "Explain the input schema for an Apex action.",
    ],
  },
  {
    id: "salesforce-hosted-prompt-builder",
    vendor: "Salesforce",
    product: "Hosted Prompt Builder MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/prompt-builder.html",
    authProfile:
      "Salesforce Hosted MCP OAuth; exposes published Prompt Builder templates as MCP prompts.",
    install: ["Publish Prompt Builder templates through Salesforce Hosted MCP custom server setup"],
    policyProfile: "read-first",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List published Prompt Builder prompts.",
      "Explain which clients support MCP prompts.",
    ],
  },
  {
    id: "agentforce-vibes-mcp-client",
    vendor: "Salesforce",
    product: "Agentforce Vibes MCP Client",
    kind: "docs",
    officialStatus: "official-docs-only",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/devagent-mcp.html",
    authProfile:
      "Agentforce Vibes extension consumes MCP tools; configure the client to point at trusted MCP servers.",
    install: ["Install Agentforce Vibes Extension", "Configure MCP tools for the project"],
    policyProfile: "read-first",
    skills: ["salesforce-agentforce", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Explain how Agentforce Vibes should consume Salesforce Executor MCP tools.",
      "Create a safe MCP client setup checklist for Agentforce Vibes.",
    ],
  },
  {
    id: "salesforce-hosted-custom-servers",
    vendor: "Salesforce",
    product: "Hosted Custom MCP Servers",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/custom-servers.html",
    authProfile:
      "Salesforce Hosted MCP OAuth; combines selected Salesforce tools into a persona-specific server.",
    install: ["Create and publish a custom Hosted MCP server in Salesforce Setup"],
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-agentforce", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Design a read-only reporting custom server.",
      "Design a support operations custom server with approval boundaries.",
    ],
  },
  {
    id: "data360-mcp",
    vendor: "Salesforce",
    product: "Data 360 MCP",
    kind: "mcp-stdio",
    officialStatus: "official-api-local-adapter",
    docsUrl:
      "https://developer.salesforce.com/blogs/2026/05/introducing-the-data-360-mcp-server-developer-preview",
    authProfile: "Uses Salesforce CLI access token or Data 360 env vars; never commit tokens.",
    install: [
      "Build the Data 360 MCP jar in your local D360_MCP_REPO clone (mvn clean package -DskipTests)",
      "Set D360_CODEX_PLUGIN_ROOT to your local Data 360 Codex plugin clone",
      "D360_ORG_ALIAS=<org-alias> bun run setup:salesforce -- --only data360-mcp",
    ],
    executorSourceConfig: {
      transport: "stdio",
      name: "Data 360 MCP",
      namespace: "data360",
      command: `${repoRootToken}/scripts/run-data360-mcp.sh`,
      cwd: repoRootToken,
      env: {
        D360_ORG_ALIAS: "${D360_ORG_ALIAS}",
        D360_CODEX_PLUGIN_ROOT: data360PluginRootToken,
        SPRING_PROFILES_ACTIVE: "stdio",
        CDP_SEARCH_STRATEGY: "keyword",
        DATA360_SEARCH_STRATEGY: "keyword",
        SPRING_AI_OPENAI_EMBEDDING_ENABLED: "false",
        OPENAI_API_KEY: "sk-dummy-not-used",
      },
    },
    policyProfile: "full-platform",
    skills: ["salesforce-data360", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Run Data 360 search for data model objects.",
      "Get payload examples for d360_query_sql.",
    ],
  },
  {
    id: "data360-hosted-mcp",
    vendor: "Salesforce",
    product: "Data 360 Hosted SQL MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/data-cloud-sql.html",
    authProfile: "Salesforce Hosted MCP OAuth; exposes Data 360 SQL query tools.",
    install: [
      "Use endpoint /data/data-cloud-queries from a Salesforce org with Hosted MCP enabled",
    ],
    policyProfile: "read-first",
    skills: ["salesforce-data360", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List named Data 360 SQL query tools exposed by Hosted MCP.",
      "Run a read-only Data 360 SQL query.",
    ],
  },
  {
    id: "tableau-next-mcp",
    vendor: "Salesforce",
    product: "Tableau Next MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl:
      "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/tableau-next.html",
    authProfile:
      "Salesforce Hosted MCP OAuth; exposes Tableau Next semantic models, KPIs, dashboards, and Analytics Q&A.",
    install: [
      "Use endpoint /analytics/tableau-next from a Salesforce org with Tableau Next MCP enabled",
    ],
    policyProfile: "read-first",
    skills: ["salesforce-tableau", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List Tableau Next semantic models and dashboards.",
      "Ask Analytics Q&A a governed natural-language question.",
    ],
  },
  {
    id: "tableau-mcp",
    vendor: "Salesforce",
    product: "Tableau MCP (Cloud / Server)",
    kind: "mcp-stdio",
    officialStatus: "official",
    docsUrl: "https://tableau.github.io/tableau-mcp/docs/intro",
    authProfile:
      "Tableau personal access token (PAT) or username/password; endpoint is the Tableau Cloud/Server instance URL.",
    install: ["npx -y @tableau/mcp-server --help"],
    executorSourceConfig: {
      transport: "stdio",
      name: "Tableau MCP",
      namespace: "tableau",
      command: "npx",
      args: ["-y", "@tableau/mcp-server"],
      env: {
        TABLEAU_HOST: "${TABLEAU_HOST}",
        TABLEAU_SITE: "${TABLEAU_SITE}",
        TABLEAU_PAT_NAME: "${TABLEAU_PAT_NAME}",
        TABLEAU_PAT_VALUE: "${TABLEAU_PAT_VALUE}",
      },
    },
    policyProfile: "read-first",
    skills: ["salesforce-tableau", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List published data sources on the configured Tableau site.",
      "Run a VizQL Data Service query against a published data source.",
    ],
  },
  {
    id: "salesforce-graphql-api",
    vendor: "Salesforce",
    product: "Salesforce GraphQL API",
    kind: "graphql",
    officialStatus: "official",
    docsUrl: "https://developer.salesforce.com/docs/platform/graphql/overview",
    authProfile:
      "Salesforce session — OAuth 2.0 against the org's GraphQL endpoint at /services/data/vXX.X/graphql.",
    install: [
      "Use the org's GraphQL endpoint /services/data/vXX.X/graphql",
      "Sign in via OAuth from the Add GraphQL source flow",
    ],
    policyProfile: "read-first",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Batch-read a small Account graph with related Contacts.",
      "Show how to page through Opportunity records over GraphQL.",
    ],
  },
  {
    id: "salesforce-b2c-commerce-dx-mcp",
    vendor: "Salesforce",
    product: "B2C Commerce DX MCP",
    kind: "mcp-stdio",
    officialStatus: "official",
    docsUrl: "https://developer.salesforce.com/docs/commerce/b2c-commerce/guide/mcp-dx-intro.html",
    authProfile:
      "B2C Commerce sandbox / instance auth via the @salesforce/b2c-dx-cli session; covers SCAPI, cartridges, PWA Kit v3, Managed Runtime.",
    install: [
      "npm install -g @salesforce/b2c-dx-cli",
      "b2c login",
      "npx -y @salesforce/b2c-dx-mcp --help",
    ],
    executorSourceConfig: {
      transport: "stdio",
      name: "B2C Commerce DX MCP",
      namespace: "b2c-commerce-dx",
      command: "npx",
      args: ["-y", "@salesforce/b2c-dx-mcp"],
    },
    policyProfile: "full-platform",
    skills: ["salesforce-core", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List SCAPI families exposed by the configured B2C instance.",
      "Show available cartridge templates without writing to the sandbox.",
    ],
  },
  {
    id: "heroku-mcp",
    vendor: "Heroku",
    product: "Heroku MCP",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl: "https://github.com/heroku/heroku-mcp-server",
    authProfile:
      "Remote Heroku MCP OAuth; local CLI access stays available through the Salesforce Family CLI Bridge or manual stdio setup.",
    install: [
      "Use https://mcp.heroku.com/mcp",
      "Sign in with Heroku OAuth",
      "optional local stdio: heroku login && heroku mcp:start",
    ],
    executorSourceConfig: {
      transport: "remote",
      name: "Heroku MCP",
      namespace: "heroku",
      endpoint: "https://mcp.heroku.com/mcp",
      remoteTransport: "auto",
      auth: { kind: "oauth2", connectionId: "mcp-oauth2-heroku" },
    },
    policyProfile: "full-platform",
    skills: ["salesforce-heroku", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List Heroku apps for the signed-in account.",
      "Show config var names for an app without revealing values.",
    ],
  },
  {
    id: "heroku-mcp-stdio",
    vendor: "Heroku",
    product: "Heroku MCP (local stdio)",
    kind: "mcp-stdio",
    officialStatus: "official",
    docsUrl: "https://devcenter.heroku.com/articles/heroku-mcp-server",
    authProfile:
      "Reuses the local Heroku CLI session (heroku login). Avoids the OAuth round-trip when an authenticated CLI is already on the host.",
    install: ["heroku --version", "heroku login", "heroku mcp:start --help"],
    executorSourceConfig: {
      transport: "stdio",
      name: "Heroku MCP (stdio)",
      namespace: "heroku-stdio",
      command: "heroku",
      args: ["mcp:start"],
    },
    policyProfile: "full-platform",
    skills: ["salesforce-heroku", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List Heroku apps via the local CLI session without an OAuth round-trip.",
      "Inspect dyno status for an app from the stdio MCP variant.",
    ],
  },
  {
    id: "mulesoft-mcp",
    vendor: "MuleSoft",
    product: "MuleSoft MCP Server",
    kind: "mcp-stdio",
    officialStatus: "official",
    docsUrl: "https://docs.mulesoft.com/mulesoft-mcp-server/",
    authProfile: "Uses Anypoint connected app or local Anypoint CLI credentials.",
    install: ["npm install -g anypoint-cli-v4", "npx -y mulesoft-mcp-server start"],
    executorSourceConfig: {
      transport: "stdio",
      name: "MuleSoft MCP",
      namespace: "mulesoft",
      command: "npx",
      args: ["-y", "mulesoft-mcp-server", "start"],
    },
    policyProfile: "full-platform",
    skills: ["salesforce-mulesoft", "salesforce-full-platform-operator"],
    demoPrompts: ["List accessible Anypoint organizations.", "Show available Exchange assets."],
  },
  {
    id: "mulesoft-mcp-connector",
    vendor: "MuleSoft",
    product: "Anypoint Connector for MCP",
    kind: "docs",
    officialStatus: "official-docs-only",
    docsUrl: "https://docs.mulesoft.com/mcp-connector/1.2/",
    authProfile:
      "Mule runtime connector for building MCP-aware integrations; not an Executor source by itself.",
    install: [
      "Use the Anypoint Connector for MCP docs when designing Mule apps that expose or consume MCP",
    ],
    policyProfile: "read-first",
    skills: ["salesforce-mulesoft", "salesforce-full-platform-operator"],
    demoPrompts: [
      "Explain when to use MuleSoft MCP Server versus Anypoint Connector for MCP.",
      "Draft an integration pattern for a Mule app that exposes MCP tools.",
    ],
  },
  {
    id: "slack-mcp",
    vendor: "Slack",
    product: "Slack MCP Server",
    kind: "mcp-remote",
    officialStatus: "official",
    docsUrl: "https://docs.slack.dev/ai/mcp-server/",
    authProfile: "Remote MCP OAuth for a Slack workspace.",
    install: ["Install or configure the Slack MCP app", "Use https://mcp.slack.com/mcp"],
    executorSourceConfig: {
      transport: "remote",
      name: "Slack MCP",
      namespace: "slack",
      endpoint: "https://mcp.slack.com/mcp",
      remoteTransport: "auto",
      auth: { kind: "oauth2", connectionId: "mcp-oauth2-slack" },
    },
    policyProfile: "full-platform",
    skills: ["salesforce-slack", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List channels visible to the signed-in Slack user.",
      "Search recent Slack messages for a deployment incident.",
    ],
  },
  {
    id: "informatica-idmc-api",
    vendor: "Informatica",
    product: "IDMC REST API Adapter",
    kind: "local-adapter",
    officialStatus: "official-api-local-adapter",
    docsUrl:
      "https://docs.informatica.com/integration-cloud/cloud-platform/current-version/rest-api-reference/informatica-intelligent-cloud-services-rest-api.html",
    authProfile:
      "Uses INFORMATICA_BASE_URL and INFORMATICA_SESSION_ID or bearer token from local env/secrets.",
    install: [
      "Configure INFORMATICA_BASE_URL",
      "Configure INFORMATICA_SESSION_ID or INFORMATICA_BEARER_TOKEN",
    ],
    executorSourceConfig: {
      transport: "stdio",
      name: "Informatica IDMC API",
      namespace: "informatica-idmc",
      command: `${repoRootToken}/scripts/run-informatica-idmc-adapter.sh`,
      cwd: repoRootToken,
      env: { SALESFORCE_EXECUTOR_LOCAL_ADAPTER: "informatica-idmc" },
    },
    policyProfile: "approval-required",
    skills: ["salesforce-informatica", "salesforce-full-platform-operator"],
    demoPrompts: [
      "List IDMC REST resource families.",
      "Check whether local Informatica credentials are configured.",
    ],
  },
  {
    id: "salesforce-family-cli-bridge",
    vendor: "Salesforce",
    product: "Salesforce Family CLI Bridge",
    kind: "cli-bridge",
    officialStatus: "official-api-local-adapter",
    docsUrl: "https://developer.salesforce.com/tools/salesforcecli",
    authProfile: "Uses installed official CLIs and their local sessions.",
    install: ["sf --version", "heroku --version", "anypoint-cli-v4 --version", "slack --version"],
    executorSourceConfig: {
      transport: "stdio",
      name: "Salesforce Family CLI Bridge",
      namespace: "salesforce-cli",
      command: `${repoRootToken}/scripts/run-salesforce-cli-bridge.sh`,
      cwd: repoRootToken,
      env: { SALESFORCE_EXECUTOR_LOCAL_ADAPTER: "salesforce-cli" },
    },
    policyProfile: "full-platform",
    skills: [
      "salesforce-core",
      "salesforce-heroku",
      "salesforce-mulesoft",
      "salesforce-slack",
      "salesforce-tableau",
    ],
    demoPrompts: ["Run sf org list --json.", "Run heroku apps --json."],
  },
];

export const destructiveToolPolicyPatterns = [
  "salesforce-dx.create_org_snapshot",
  "salesforce-dx.create_scratch_org",
  "salesforce-dx.delete_org",
  "salesforce-dx.deploy_metadata",
  "salesforce-dx.retrieve_metadata",
  "salesforce-dx.assign_permission_set",
  "salesforce-dx.run_apex_test",
  "salesforce-dx.run_agent_test",
  "salesforce-dx.create_devops_center_work_item",
  "salesforce-dx.promote_devops_center_work_item",
  "salesforce-dx.resolve_devops_center_merge_conflict",
  "salesforce-dx.resolve_devops_center_deployment_failure",
  "salesforce-dx.checkout_devops_center_work_item",
  "salesforce-dx.commit_devops_center_work_item",
  "salesforce-dx.update_devops_center_work_item_status",
  "salesforce-dx.create_devops_center_pull_request",
  "mulesoft.deploy_mule_application",
  "mulesoft.update_mule_application",
  "mulesoft.run_local_mule_application",
  "mulesoft.create_install_runtime_fabric",
  "mulesoft.delete_runtime_fabric",
  "mulesoft.upgrade_runtime_fabric",
  "mulesoft.create_and_manage_assets",
  "mulesoft.manage_api_instance_policy",
  "mulesoft.create_and_manage_api_instances",
  "mulesoft.manage_flex_gateway_policy_project",
  "salesforce-cli.sf_cli_run",
  "salesforce-cli.heroku_cli_run",
  "salesforce-cli.anypoint_cli_run",
  "salesforce-cli.slack_cli_run",
  "informatica-idmc.informatica_idmc_request",
  "salesforce-cli.*",
  "data360.execute",
  // Heroku stdio MCP exposes the same surface as the remote Heroku MCP;
  // mirror its full-platform default for parity.
  "heroku-stdio.*",
  // B2C Commerce DX MCP can deploy cartridges and trigger sandbox-side
  // mutations; treat its mutating verbs as approval-required.
  "b2c-commerce-dx.deploy_cartridge",
  "b2c-commerce-dx.upload_storefront",
  "b2c-commerce-dx.publish_pwa_kit",
  "b2c-commerce-dx.create_managed_runtime_target",
  "b2c-commerce-dx.delete_managed_runtime_target",
] as const;

export const deprecatedDestructiveToolPolicyPatterns = [
  "salesforce-dx.*",
  "salesforce-hosted.*",
  "heroku.*",
  "mulesoft.*",
  "slack.*",
] as const;

export const sourceById = (id: string): SalesforceSourceDefinition | undefined =>
  salesforceSourceRegistry.find((source) => source.id === id);
