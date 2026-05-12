import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "packages/salesforce-docs-index/src/**/*.test.ts"],
  },
});
