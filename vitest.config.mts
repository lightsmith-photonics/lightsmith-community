import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./src/", import.meta.url)) + "$1" },
      { find: /^@fixtures\/(.*)$/, replacement: fileURLToPath(new URL("./fixtures/", import.meta.url)) + "$1" },
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
