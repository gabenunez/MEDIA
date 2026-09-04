import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": webRoot,
    },
  },
  test: {
    name: "@media-app/web",
    environment: "happy-dom",
    include: ["app/**/*.test.ts", "lib/**/*.test.ts", "components/**/*.test.ts"],
  },
});
