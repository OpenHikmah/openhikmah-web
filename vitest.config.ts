import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    // Forks pool is more compatible with Bun's runtime on Windows.
    // The prior threads preference was Node.js-specific.
    pool: "forks",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests need Docker (Testcontainers) and run via
    // vitest.integration.config.ts — keep them out of the fast unit suite.
    exclude: ["node_modules", ".next", "__tests__/integration/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**", "store/**", "app/api/**"],
      exclude: ["node_modules", ".next"],
      // Floor set a few points below the baseline measured 2026-07-16
      // (statements 66.93%, branches 68.25%, functions 63.26%, lines 68.71%)
      // so it catches regressions without blocking on day-to-day fluctuation.
      // Ratchet these up over time as coverage improves.
      thresholds: {
        statements: 65,
        branches: 65,
        functions: 60,
        lines: 65,
      },
    },
  },
});
