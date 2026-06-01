import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    // Threads start far faster than forked processes on Windows and avoid the
    // worker-startup timeouts seen when many jsdom workers spawn under git hooks.
    pool: "threads",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests need Docker (Testcontainers) and run via
    // vitest.integration.config.ts — keep them out of the fast unit suite.
    exclude: ["node_modules", ".next", "__tests__/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**", "store/**", "app/api/**"],
      exclude: ["node_modules", ".next"],
    },
  },
});
