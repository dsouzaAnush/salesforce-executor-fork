import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@effect/vitest";

import {
  logoForSourceId,
  officialDocsIndex,
  productGroupForSourceId,
  productGroupOrder,
  salesforceProductLogos,
  salesforceSourceRegistry,
  sourceLogoKeys,
  sourceProductGroups,
} from ".";

// Repo-root-anchored, resolved off this file so the test passes regardless
// of `process.cwd()`. Logos live under `apps/local/public/` and are served
// by Vite at the leading-slash paths the registry records.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const PUBLIC_DIR = resolve(REPO_ROOT, "apps/local/public");

describe("salesforce source registry", () => {
  it("uses unique ids and official documentation urls", () => {
    const ids = new Set<string>();
    for (const source of salesforceSourceRegistry) {
      expect(ids.has(source.id)).toBe(false);
      ids.add(source.id);
      expect(source.docsUrl.startsWith("https://")).toBe(true);
      expect(source.skills.length).toBeGreaterThan(0);
      expect(source.demoPrompts.length).toBeGreaterThan(0);
    }
    const persistedEnvKeys = salesforceSourceRegistry.flatMap((source) =>
      source.executorSourceConfig && "env" in source.executorSourceConfig
        ? Object.keys(source.executorSourceConfig.env ?? {})
        : [],
    );
    expect(persistedEnvKeys).not.toContain("CDP_ACCESS_TOKEN");
  });

  it("tracks official docs separately from cached page bodies", () => {
    expect(officialDocsIndex.length).toBeGreaterThan(8);
    for (const doc of officialDocsIndex) {
      expect(doc.url.startsWith("https://")).toBe(true);
    }
  });

  it("maps every source to an official product logo", () => {
    for (const source of salesforceSourceRegistry) {
      const logo = logoForSourceId(source.id);
      expect(logo).toBeDefined();
      expect(logo?.src.startsWith("/salesforce-logos/")).toBe(true);
      expect(logo?.sourceUrl.startsWith("https://")).toBe(true);
      expect(logo?.sfAgentAsset.length).toBeGreaterThan(0);
      expect(logo?.tileBackground.length).toBeGreaterThan(0);
    }
    expect(Object.keys(salesforceProductLogos).sort()).toEqual([
      "data360",
      "heroku",
      "informatica",
      "mulesoft",
      "salesforce",
      "slack",
      "tableau",
    ]);
  });

  // Guard against the regression we just fixed: pre-rename, both salesforce
  // and data360 entries pointed at `/salesforce-logos/Salesforce-logo.png`
  // while the only file on disk was `Salesforce.svg`. The prefix check above
  // can't catch that — this one resolves the asset against apps/local/public
  // and fails if it's missing.
  it("serves every logo asset from apps/local/public", () => {
    for (const logo of Object.values(salesforceProductLogos)) {
      const assetPath = resolve(PUBLIC_DIR, logo.src.replace(/^\//, ""));
      expect(existsSync(assetPath), `${logo.key} logo missing at ${assetPath}`).toBe(true);
    }
  });

  it("does not orphan logo or product-group entries", () => {
    const knownIds = new Set(salesforceSourceRegistry.map((source) => source.id));
    for (const id of Object.keys(sourceLogoKeys)) {
      expect(knownIds.has(id)).toBe(true);
    }
    for (const id of Object.keys(sourceProductGroups)) {
      expect(knownIds.has(id)).toBe(true);
    }
  });

  it("places every source in a known product group", () => {
    const validGroups = new Set(productGroupOrder);
    for (const source of salesforceSourceRegistry) {
      const group = productGroupForSourceId(source.id);
      expect(group).toBeDefined();
      expect(group !== undefined && validGroups.has(group)).toBe(true);
    }
  });
});
