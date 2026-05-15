import { defineExecutorConfig } from "@executor-js/sdk";
import type { ConfigFileSink } from "@executor-js/config";
import { openApiHttpPlugin } from "@executor-js/plugin-openapi/api";
import { mcpHttpPlugin } from "@executor-js/plugin-mcp/api";
import { googleDiscoveryHttpPlugin } from "@executor-js/plugin-google-discovery/api";
import { graphqlHttpPlugin } from "@executor-js/plugin-graphql/api";
import { keychainPlugin } from "@executor-js/plugin-keychain";
import { fileSecretsPlugin } from "@executor-js/plugin-file-secrets";
import { onepasswordHttpPlugin } from "@executor-js/plugin-onepassword/api";
import { salesforcePresets } from "@salesforce-executor/docs-index";

// ---------------------------------------------------------------------------
// Single source of truth for the local app's plugin list.
//
// Consumed by:
//   - the schema-gen CLI (reads `plugin.schema` only; calls `plugins({})`)
//   - the host runtime (calls `plugins({ configFile })` with a real sink)
//
// `TDeps` is inferred from the factory parameter annotation directly.
// First-party and third-party plugins use the same import-and-call flow.
//
// Salesforce-overlay note: the curated catalog from
// `@salesforce-executor/docs-index` is forwarded into each plugin's
// `extraPresets`. The upstream Connect dialog renders these alongside
// built-in presets — no parallel sources page, no `/source-manager`.
// ---------------------------------------------------------------------------

interface LocalPluginDeps {
  readonly configFile?: ConfigFileSink;
}

export default defineExecutorConfig({
  dialect: "sqlite",
  plugins: ({ configFile }: LocalPluginDeps = {}) =>
    [
      openApiHttpPlugin({ configFile, extraPresets: salesforcePresets.openapi }),
      mcpHttpPlugin({
        dangerouslyAllowStdioMCP: true,
        configFile,
        extraPresets: salesforcePresets.mcp,
      }),
      googleDiscoveryHttpPlugin(),
      graphqlHttpPlugin({ configFile, extraPresets: salesforcePresets.graphql }),
      keychainPlugin(),
      fileSecretsPlugin(),
      onepasswordHttpPlugin(),
    ] as const,
});
