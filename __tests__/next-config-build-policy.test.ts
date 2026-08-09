import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import nextConfig from "../next.config";

// Regression test for the Docker-build OOM fix: next.config.ts skips
// TypeScript checking during `next build` only because CI's separate
// `bun run typecheck` step is a required merge gate. If either half of
// that pair is ever removed without the other, type errors could reach
// production silently — this pins both halves so a future edit can't
// drop one without failing a test.
describe("next.config.ts build policy", () => {
  it("disables in-build TypeScript checking on the resolved config (Coolify build container OOMs otherwise)", () => {
    // Import the actual default export (post next-intl-plugin wrapping) rather
    // than regex-matching the source text, so a commented-out or dead-code
    // `typescript` block can't make this pass.
    expect(nextConfig.typescript?.ignoreBuildErrors).toBe(true);
  });

  it("keeps `bun run typecheck` as an active step in CI's required lint-typecheck-test job", () => {
    const ciWorkflowSource = readFileSync(
      path.join(process.cwd(), ".github/workflows/ci.yml"),
      "utf8"
    );

    // Scope the match to the lint-typecheck-test job block specifically (not
    // just anywhere in the file — a step in some other, non-blocking job
    // wouldn't actually gate merges), and require an uncommented `run:` line.
    const lines = ciWorkflowSource.split("\n");
    const jobStart = lines.findIndex((line) => /^ {2}lint-typecheck-test:\s*$/.test(line));
    expect(jobStart).toBeGreaterThanOrEqual(0);
    const jobEnd = lines.findIndex((line, i) => i > jobStart && /^ {2}[\w-]+:\s*$/.test(line));
    const jobLines = lines.slice(jobStart + 1, jobEnd === -1 ? undefined : jobEnd);

    const hasActiveTypecheckStep = jobLines.some(
      (line) => /^\s*run:\s*bun run typecheck\s*$/.test(line) && !/^\s*#/.test(line)
    );
    expect(hasActiveTypecheckStep).toBe(true);
  });
});
