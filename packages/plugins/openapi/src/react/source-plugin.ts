import { lazy } from "react";
import type { SourcePlugin } from "@executor-js/sdk/client";
import { openApiPresets, type OpenApiPreset } from "../sdk/presets";

const importAdd = () => import("./AddOpenApiSource");
const importEdit = () => import("./EditOpenApiSource");
const importSummary = () => import("./OpenApiSourceSummary");

export interface OpenApiSourcePluginOptions {
  /** Vendor-specific presets contributed by the host (e.g. Salesforce
   *  GraphQL/OpenAPI catalog). Appended after the built-in
   *  `openApiPresets` so vendor entries appear last unless the host
   *  opts into custom ordering. */
  readonly extraPresets?: ReadonlyArray<OpenApiPreset>;
}

export const createOpenApiSourcePlugin = (options?: OpenApiSourcePluginOptions): SourcePlugin => ({
  key: "openapi",
  label: "OpenAPI",
  add: lazy(importAdd),
  edit: lazy(importEdit),
  summary: lazy(importSummary),
  presets: [...openApiPresets, ...(options?.extraPresets ?? [])],
  preload: () => {
    void importAdd();
    void importEdit();
    void importSummary();
  },
});

/** @deprecated Use `createOpenApiSourcePlugin()` instead. */
export const openApiSourcePlugin: SourcePlugin = createOpenApiSourcePlugin();
