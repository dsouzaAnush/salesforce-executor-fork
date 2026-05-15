// ---------------------------------------------------------------------------
// @executor-js/plugin-mcp/client — `defineClientPlugin` factory entry.
//
// Default-exports a factory rather than a value: at build time the
// `@executor-js/vite-plugin` reads each plugin spec's `clientConfig`
// from `executor.config.ts` and emits `__p(<JSON.stringify(clientConfig)>)`
// into the virtual `plugins-client` module. So `allowStdio` flows from
// the server-side `mcpPlugin({ dangerouslyAllowStdioMCP })` straight
// into the bundle — no parallel client-side flag, no per-host shim,
// no runtime fetch.
// ---------------------------------------------------------------------------

import { defineClientPlugin } from "@executor-js/sdk/client";

import { createMcpSourcePlugin } from "./source-plugin";
import type { McpPreset } from "../sdk/presets";

export interface McpClientConfig {
  /**
   * Mirrors `dangerouslyAllowStdioMCP` on the server-side plugin. When
   * false, the AddMcpSource UI hides the stdio tab and stdio presets.
   * Defaults to false — same default as the server flag.
   */
  readonly allowStdio?: boolean;
  /** Vendor presets forwarded from the server-side plugin's
   *  `extraPresets`. Serialized through the Vite plugin into the
   *  client bundle so values must be JSON-safe. */
  readonly extraPresets?: ReadonlyArray<McpPreset>;
}

export default function createMcpClientPlugin(config?: McpClientConfig) {
  return defineClientPlugin({
    id: "mcp" as const,
    sourcePlugin: createMcpSourcePlugin({
      allowStdio: config?.allowStdio ?? false,
      extraPresets: config?.extraPresets ?? [],
    }),
  });
}
