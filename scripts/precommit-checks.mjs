/**
 * Custom strict pre-commit guards, run by .husky/pre-commit before
 * lint-staged / typecheck / tests. Cross-platform (Node, not bash).
 *
 * Guards:
 *   1. Block direct commits to main.
 *   2. Block focused/skipped tests (.only / .skip / fdescribe / xit …).
 *   3. Forbid leftover debug (debugger; / console.log) in TS source.
 *   4. Secret scan via gitleaks (enforced when installed; warns if absent).
 *
 * Exits non-zero on any violation, aborting the commit.
 */
import { execSync, spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
const fail = (msg) => console.error(`${RED}✗ ${msg}${RESET}`);
const warn = (msg) => console.warn(`${YELLOW}! ${msg}${RESET}`);

let violations = 0;

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Staged blob content (handles partially-staged files correctly).
function stagedContent(file) {
  try {
    return execSync(`git show :${JSON.stringify(file)}`, { encoding: "utf8" });
  } catch {
    return "";
  }
}

const stagedFiles = sh("git diff --cached --name-only --diff-filter=ACM")
  .split("\n")
  .filter(Boolean);

// ── 1. Block direct commits to main ─────────────────────────────────────────
const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch === "main" || branch === "master") {
  fail(`Direct commits to "${branch}" are blocked — work on a feature branch.`);
  violations++;
}

// ── 2 & 3. Content guards on staged TS source ───────────────────────────────
const FOCUSED = [
  /\b(?:describe|it|test|context)\.only\s*\(/,
  /\b(?:describe|it|test|context)\.skip\s*\(/,
  /\b(?:fdescribe|fit|xdescribe|xit)\s*\(/,
];
const DEBUG = [/\bdebugger\b/, /\bconsole\.log\s*\(/];

for (const file of stagedFiles) {
  if (!/\.(ts|tsx)$/.test(file)) continue; // .mjs scripts legitimately use console.log
  const content = stagedContent(file);
  const isTest = /(\.test\.|\.spec\.|__tests__\/)/.test(file);

  if (isTest) {
    for (const re of FOCUSED) {
      if (re.test(content)) {
        fail(`Focused/skipped test (${re.source}) in ${file}`);
        violations++;
        break;
      }
    }
  }

  for (const re of DEBUG) {
    if (re.test(content)) {
      fail(`Leftover debug (${re.source}) in ${file} — use console.error/warn or remove.`);
      violations++;
      break;
    }
  }
}

// ── 4. Secret scan (gitleaks) ───────────────────────────────────────────────
const hasGitleaks = spawnSync("gitleaks", ["version"], { stdio: "ignore" }).status === 0;
if (hasGitleaks) {
  const res = spawnSync("gitleaks", ["protect", "--staged", "--redact"], { stdio: "inherit" });
  if (res.status !== 0) {
    fail("gitleaks detected potential secrets in staged changes.");
    violations++;
  }
} else {
  warn(
    "gitleaks not installed — secret scan SKIPPED. Install to enforce:\n" +
      "    winget install gitleaks   (or: https://github.com/gitleaks/gitleaks#installing)"
  );
}

if (violations > 0) {
  fail(`${violations} pre-commit check(s) failed. Commit aborted.`);
  process.exit(1);
}
