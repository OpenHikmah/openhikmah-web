import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Integration test config. Spins up a real Postgres via Testcontainers
 * (globalSetup) and runs the persistence-layer tests against it. Requires a
 * running Docker daemon. Kept separate from the fast unit suite.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/integration/**/*.test.ts"],
    globalSetup: ["./__tests__/integration/global-setup.ts"],
    setupFiles: ["./__tests__/integration/inject-env.ts"],
    // One shared container/DB — run files serially to avoid cross-talk.
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
