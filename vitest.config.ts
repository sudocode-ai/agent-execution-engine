import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000, // Increase timeout for process spawning tests
    retry: 3, // Retry failed tests up to 3 times for flakes.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
