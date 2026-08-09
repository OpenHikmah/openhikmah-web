import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Regression test for the Docker-build OOM fix: next.config.ts skips
// TypeScript checking during `next build` only because CI's separate
// `bun run typecheck` step is a required merge gate. If either half of
// that pair is ever removed without the other, type errors could reach
// production silently — this pins both halves so a future edit can't
// drop one without failing a test.
describe("next.config.ts build policy", () => {
  const nextConfigSource = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  const ciWorkflowSource = readFileSync(
    path.join(process.cwd(), ".github/workflows/ci.yml"),
    "utf8"
  );

  it("disables in-build TypeScript checking (Coolify build container OOMs otherwise)", () => {
    expect(nextConfigSource).toMatch(/typescript:\s*{\s*ignoreBuildErrors:\s*true/);
  });

  it("keeps `bun run typecheck` as a required CI step, since next.config.ts no longer checks", () => {
    expect(ciWorkflowSource).toMatch(/run:\s*bun run typecheck/);
  });
});
