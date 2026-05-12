export type SalesforceProductLogoKey =
  | "salesforce"
  | "data360"
  | "tableau"
  | "heroku"
  | "mulesoft"
  | "slack"
  | "informatica";

export type SalesforceProductLogo = {
  readonly key: SalesforceProductLogoKey;
  readonly brand: string;
  readonly src: string;
  readonly alt: string;
  readonly sourceUrl: string;
  readonly sfAgentAsset: string;
  readonly tileBackground: string;
  readonly tileForeground?: "light" | "color";
  readonly presentation: "official-logo" | "brand-tile";
  readonly glyphScale?: number;
  readonly imageScale?: number;
  readonly usageNote?: string;
};

export const salesforceProductLogos: Readonly<
  Record<SalesforceProductLogoKey, SalesforceProductLogo>
> = {
  salesforce: {
    key: "salesforce",
    brand: "Salesforce",
    src: "/salesforce-logos/Salesforce.svg",
    alt: "Salesforce logo",
    sourceUrl: "https://www.salesforce.com/news/media-collection/company-logos-and-video/",
    sfAgentAsset: "apps/local/public/salesforce-logos/Salesforce.svg",
    tileBackground: "#FFFFFF",
    tileForeground: "color",
    presentation: "official-logo",
    imageScale: 1.42,
  },
  data360: {
    key: "data360",
    brand: "Data 360",
    src: "/salesforce-logos/Salesforce.svg",
    alt: "Salesforce logo for Data 360",
    sourceUrl: "https://www.salesforce.com/data/",
    sfAgentAsset: "apps/local/public/salesforce-logos/Salesforce.svg",
    tileBackground: "#FFFFFF",
    tileForeground: "color",
    presentation: "official-logo",
    imageScale: 1.42,
    usageNote:
      "Data 360 uses the official Salesforce logo because Salesforce does not provide a separate Data 360 logo in the public company-logo collection.",
  },
  tableau: {
    key: "tableau",
    brand: "Tableau",
    src: "/salesforce-logos/Tableau.svg",
    alt: "Tableau mark",
    sourceUrl: "https://www.tableau.com/about/media-download-center",
    sfAgentAsset: "apps/local/public/salesforce-logos/Tableau.svg",
    tileBackground: "#1F70C1",
    tileForeground: "light",
    presentation: "brand-tile",
    glyphScale: 0.8,
  },
  heroku: {
    key: "heroku",
    brand: "Heroku",
    src: "/salesforce-logos/Heroku.svg",
    alt: "Heroku mark",
    sourceUrl: "https://devcenter.heroku.com/articles/heroku-brand-guidelines",
    sfAgentAsset: "apps/local/public/salesforce-logos/Heroku.svg",
    tileBackground: "#430098",
    tileForeground: "light",
    presentation: "brand-tile",
  },
  mulesoft: {
    key: "mulesoft",
    brand: "MuleSoft",
    src: "/salesforce-logos/MuleSoft.svg",
    alt: "MuleSoft mark",
    sourceUrl: "https://www.salesforce.com/news/media-collection/company-logos-and-video/",
    sfAgentAsset: "apps/local/public/salesforce-logos/MuleSoft.svg",
    tileBackground: "#00A0DF",
    tileForeground: "light",
    presentation: "brand-tile",
  },
  slack: {
    key: "slack",
    brand: "Slack",
    src: "/salesforce-logos/Slack.svg",
    alt: "Slack logo",
    sourceUrl: "https://slack.com/media-kit",
    sfAgentAsset: "apps/local/public/salesforce-logos/Slack.svg",
    tileBackground: "linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(34, 197, 94, 0.12))",
    tileForeground: "color",
    presentation: "brand-tile",
    glyphScale: 0.72,
  },
  informatica: {
    key: "informatica",
    brand: "Informatica",
    src: "/salesforce-logos/Informatica.svg",
    alt: "Informatica mark",
    sourceUrl: "https://www.informatica.com/",
    sfAgentAsset: "apps/local/public/salesforce-logos/Informatica.svg",
    tileBackground: "#FF4F00",
    tileForeground: "light",
    presentation: "brand-tile",
  },
} as const;

export const sourceLogoKeys: Readonly<Record<string, SalesforceProductLogoKey>> = {
  "salesforce-official-docs": "salesforce",
  "salesforce-codex-skills": "salesforce",
  "salesforce-dx-mcp": "salesforce",
  "salesforce-hosted-mcp": "salesforce",
  "salesforce-hosted-sobject-reads": "salesforce",
  "salesforce-hosted-sobject-all": "salesforce",
  "salesforce-hosted-sobject-mutations": "salesforce",
  "salesforce-hosted-sobject-deletes": "salesforce",
  "salesforce-hosted-api-catalog": "salesforce",
  "salesforce-hosted-flows": "salesforce",
  "salesforce-hosted-invocable-actions": "salesforce",
  "salesforce-hosted-prompt-builder": "salesforce",
  "salesforce-hosted-custom-servers": "salesforce",
  "salesforce-graphql-api": "salesforce",
  "salesforce-b2c-commerce-dx-mcp": "salesforce",
  "agentforce-vibes-mcp-client": "salesforce",
  "data360-mcp": "data360",
  "data360-hosted-mcp": "data360",
  "tableau-next-mcp": "tableau",
  "tableau-mcp": "tableau",
  "heroku-mcp": "heroku",
  "heroku-mcp-stdio": "heroku",
  "mulesoft-mcp": "mulesoft",
  "mulesoft-mcp-connector": "mulesoft",
  "slack-mcp": "slack",
  "informatica-idmc-api": "informatica",
  "salesforce-family-cli-bridge": "salesforce",
} as const;

/**
 * Stable display group for the Salesforce catalog page. Replaces the
 * brittle `source.product.startsWith("Agentforce")`-style routing in
 * `SalesforceSourcesPage`. Add new entries here when adding new sources;
 * the registry test pins every source id against this map.
 */
export type SalesforceProductGroup =
  | "Salesforce"
  | "Agentforce"
  | "Commerce"
  | "Data 360"
  | "Tableau"
  | "Heroku"
  | "MuleSoft"
  | "Slack"
  | "Informatica";

export const productGroupOrder: readonly SalesforceProductGroup[] = [
  "Salesforce",
  "Agentforce",
  "Commerce",
  "Data 360",
  "Tableau",
  "Heroku",
  "MuleSoft",
  "Slack",
  "Informatica",
] as const;

export const sourceProductGroups: Readonly<Record<string, SalesforceProductGroup>> = {
  "salesforce-official-docs": "Salesforce",
  "salesforce-codex-skills": "Salesforce",
  "salesforce-dx-mcp": "Salesforce",
  "salesforce-hosted-mcp": "Salesforce",
  "salesforce-hosted-sobject-reads": "Salesforce",
  "salesforce-hosted-sobject-all": "Salesforce",
  "salesforce-hosted-sobject-mutations": "Salesforce",
  "salesforce-hosted-sobject-deletes": "Salesforce",
  "salesforce-hosted-api-catalog": "Salesforce",
  "salesforce-hosted-flows": "Salesforce",
  "salesforce-hosted-invocable-actions": "Salesforce",
  "salesforce-hosted-prompt-builder": "Salesforce",
  "salesforce-hosted-custom-servers": "Salesforce",
  "salesforce-graphql-api": "Salesforce",
  "salesforce-b2c-commerce-dx-mcp": "Commerce",
  "agentforce-vibes-mcp-client": "Agentforce",
  "data360-mcp": "Data 360",
  "data360-hosted-mcp": "Data 360",
  "tableau-next-mcp": "Tableau",
  "tableau-mcp": "Tableau",
  "heroku-mcp": "Heroku",
  "heroku-mcp-stdio": "Heroku",
  "mulesoft-mcp": "MuleSoft",
  "mulesoft-mcp-connector": "MuleSoft",
  "slack-mcp": "Slack",
  "informatica-idmc-api": "Informatica",
  "salesforce-family-cli-bridge": "Salesforce",
} as const;

export const productGroupForSourceId = (sourceId: string): SalesforceProductGroup | undefined =>
  sourceProductGroups[sourceId];

export const namespaceLogoKeys: Readonly<Record<string, SalesforceProductLogoKey>> = {
  "salesforce-dx": "salesforce",
  "salesforce-hosted": "salesforce",
  "tableau-next": "tableau",
  tableau: "tableau",
  "b2c-commerce-dx": "salesforce",
  data360: "data360",
  heroku: "heroku",
  "heroku-stdio": "heroku",
  mulesoft: "mulesoft",
  slack: "slack",
  "informatica-idmc": "informatica",
  "salesforce-cli": "salesforce",
} as const;

export const logoForSourceId = (sourceId: string): SalesforceProductLogo | undefined => {
  const key = sourceLogoKeys[sourceId];
  return key ? salesforceProductLogos[key] : undefined;
};

export const logoForNamespace = (namespace: string): SalesforceProductLogo | undefined => {
  const key = namespaceLogoKeys[namespace];
  return key ? salesforceProductLogos[key] : undefined;
};
