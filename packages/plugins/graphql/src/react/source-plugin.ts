import { lazy } from "react";
import type { SourcePlugin } from "@executor-js/sdk/client";
import { graphqlPresets, type GraphqlPreset } from "../sdk/presets";

const importAdd = () => import("./AddGraphqlSource");
const importEdit = () => import("./EditGraphqlSource");
const importSummary = () => import("./GraphqlSourceSummary");

export interface GraphqlSourcePluginOptions {
  /** Vendor-specific presets contributed by the host. Appended after
   *  the built-in `graphqlPresets`. */
  readonly extraPresets?: ReadonlyArray<GraphqlPreset>;
}

export const createGraphqlSourcePlugin = (options?: GraphqlSourcePluginOptions): SourcePlugin => ({
  key: "graphql",
  label: "GraphQL",
  add: lazy(importAdd),
  edit: lazy(importEdit),
  summary: lazy(importSummary),
  presets: [...graphqlPresets, ...(options?.extraPresets ?? [])],
  preload: () => {
    void importAdd();
    void importEdit();
    void importSummary();
  },
});

/** @deprecated Use `createGraphqlSourcePlugin()` instead. */
export const graphqlSourcePlugin: SourcePlugin = createGraphqlSourcePlugin();
