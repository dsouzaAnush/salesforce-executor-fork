/**
 * Adapter that derives upstream `@executor-js/plugin-{mcp,openapi,graphql}`
 * preset arrays from the curated Salesforce source registry. Consumed by
 * `apps/local/executor.config.ts`, which forwards each array as the
 * matching plugin's `extraPresets`. The presets show up alongside the
 * built-in entries in the upstream Connect dialog's "Popular sources"
 * grid — no parallel UI, no `/source-manager`-style detour.
 */

import { logoForSourceId } from "./logos";
import { salesforceSourceRegistry, type SalesforceSourceDefinition } from "./registry";

// ---------------------------------------------------------------------------
// Shape mirrors `@executor-js/plugin-mcp/sdk/presets#McpPreset`. Inlined here
// so this package does not take a dependency on the upstream plugin packages
// (otherwise the docs-index would carry the entire MCP/OpenAPI/GraphQL React
// surface area transitively, just to derive a few catalog entries).
// ---------------------------------------------------------------------------

export interface SalesforceMcpRemotePreset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly url: string;
  readonly icon?: string;
  readonly featured?: boolean;
  readonly transport?: undefined;
}

export interface SalesforceMcpStdioPreset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly icon?: string;
  readonly featured?: boolean;
  readonly transport: "stdio";
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export type SalesforceMcpPreset = SalesforceMcpRemotePreset | SalesforceMcpStdioPreset;

export interface SalesforceOpenApiPreset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly url: string;
  readonly icon?: string;
  readonly featured?: boolean;
}

export interface SalesforceGraphqlPreset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly url: string;
  readonly icon?: string;
  readonly featured?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const summaryFor = (source: SalesforceSourceDefinition): string => {
  const tail = source.officialStatus === "official" ? "" : ` · ${source.officialStatus}`;
  return `${source.vendor} · ${source.product}${tail}`;
};

const iconFor = (source: SalesforceSourceDefinition): string | undefined =>
  logoForSourceId(source.id)?.src;

const isMcpEligible = (
  source: SalesforceSourceDefinition,
): source is SalesforceSourceDefinition & {
  executorSourceConfig: NonNullable<SalesforceSourceDefinition["executorSourceConfig"]>;
} => {
  if (!source.executorSourceConfig) return false;
  // ExecutorOpenApiSourceConfig has `kind: "openapi"`; skip those.
  if ("kind" in source.executorSourceConfig) return false;
  return ["mcp-remote", "mcp-stdio", "cli-bridge", "local-adapter"].includes(source.kind);
};

const isFeatured = (source: SalesforceSourceDefinition): boolean =>
  // Surface the Salesforce-platform sources first; they're what someone
  // installing this fork is most likely to want at the top of the grid.
  source.vendor === "Salesforce" && source.officialStatus === "official";

// ---------------------------------------------------------------------------
// Per-plugin preset arrays
// ---------------------------------------------------------------------------

const mcpFromSource = (source: SalesforceSourceDefinition): SalesforceMcpPreset | undefined => {
  if (!isMcpEligible(source)) return undefined;
  const config = source.executorSourceConfig;
  if (!("transport" in config)) return undefined;
  const base = {
    id: source.id,
    name: source.product,
    summary: summaryFor(source),
    icon: iconFor(source),
    featured: isFeatured(source),
  } as const;
  if (config.transport === "stdio") {
    return {
      ...base,
      transport: "stdio",
      command: config.command,
      ...(config.args ? { args: config.args } : {}),
      ...(config.env ? { env: config.env } : {}),
    };
  }
  // remote
  if (!config.endpoint) return undefined;
  return { ...base, url: config.endpoint };
};

export const salesforceMcpPresets: ReadonlyArray<SalesforceMcpPreset> = salesforceSourceRegistry
  .map(mcpFromSource)
  .filter((preset): preset is SalesforceMcpPreset => preset !== undefined);

export const salesforceOpenApiPresets: ReadonlyArray<SalesforceOpenApiPreset> =
  salesforceSourceRegistry.flatMap((source) => {
    const config = source.executorSourceConfig;
    if (!config || !("kind" in config) || config.kind !== "openapi") return [];
    return [
      {
        id: source.id,
        name: source.product,
        summary: summaryFor(source),
        url: config.spec,
        icon: iconFor(source),
        featured: isFeatured(source),
      },
    ];
  });

// No GraphQL entries today expose a non-org-specific endpoint URL (the
// Salesforce GraphQL API lives at /services/data/vXX.X/graphql on the
// user's org). Keeping the export so the executor.config.ts wiring is
// symmetric and future entries land cleanly.
export const salesforceGraphqlPresets: ReadonlyArray<SalesforceGraphqlPreset> = [];

export const salesforcePresets = {
  mcp: salesforceMcpPresets,
  openapi: salesforceOpenApiPresets,
  graphql: salesforceGraphqlPresets,
} as const;
