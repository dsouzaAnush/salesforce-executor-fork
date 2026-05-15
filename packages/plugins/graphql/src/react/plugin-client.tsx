// ---------------------------------------------------------------------------
// @executor-js/plugin-graphql/client — `defineClientPlugin` factory entry.
//
// Default-exports a factory rather than a value so the host's Vite
// plugin can flow `clientConfig` from `executor.config.ts` (e.g. an
// `extraPresets` catalog) into the bundle.
// ---------------------------------------------------------------------------

import { defineClientPlugin } from "@executor-js/sdk/client";

import { createGraphqlSourcePlugin } from "./source-plugin";
import type { GraphqlPreset } from "../sdk/presets";

export interface GraphqlClientConfig {
  /** Vendor presets forwarded from the server-side plugin's
   *  `extraPresets`. Serialized through the Vite plugin into the
   *  client bundle so values must be JSON-safe. */
  readonly extraPresets?: ReadonlyArray<GraphqlPreset>;
}

export default function createGraphqlClientPlugin(config?: GraphqlClientConfig) {
  return defineClientPlugin({
    id: "graphql" as const,
    sourcePlugin: createGraphqlSourcePlugin({
      extraPresets: config?.extraPresets ?? [],
    }),
  });
}
