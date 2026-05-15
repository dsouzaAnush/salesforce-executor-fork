// ---------------------------------------------------------------------------
// @executor-js/plugin-openapi/client — `defineClientPlugin` factory entry.
//
// Default-exports a factory rather than a value so the host's Vite
// plugin can flow `clientConfig` from `executor.config.ts` (e.g. an
// `extraPresets` catalog) into the bundle. Same pattern as
// `@executor-js/plugin-mcp/client`.
// ---------------------------------------------------------------------------

import { defineClientPlugin } from "@executor-js/sdk/client";

import { createOpenApiSourcePlugin } from "./source-plugin";
import type { OpenApiPreset } from "../sdk/presets";

export interface OpenApiClientConfig {
  /** Vendor presets forwarded from the server-side plugin's
   *  `extraPresets`. Serialized through the Vite plugin into the
   *  client bundle so values must be JSON-safe. */
  readonly extraPresets?: ReadonlyArray<OpenApiPreset>;
}

export default function createOpenApiClientPlugin(config?: OpenApiClientConfig) {
  return defineClientPlugin({
    id: "openapi" as const,
    sourcePlugin: createOpenApiSourcePlugin({
      extraPresets: config?.extraPresets ?? [],
    }),
  });
}
