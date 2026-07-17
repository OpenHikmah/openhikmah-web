<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

This is the single, tool-agnostic source of truth for any AI coding agent (or human) working in this repo. Tool-specific config files (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/agents.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`, `.clinerules`, `.aider.conf.yml`) all point back here — read those only for the extra, tool-specific bits they add.

## Project overview

Open Hikmah is a theological sensemaking tool for the Quran. Contributions touch both code and sacred content, so code-quality standards and theological standards both apply, and both are binding.

## Setup / commands

```bash
bun install
cp .env.example .env.local   # fill in values, see .env.example
bun run dev                  # http://localhost:3000
```

At minimum you need `ANTHROPIC_API_KEY` set to test AI connections. Quran Foundation OAuth variables are only needed to test bookmarks.

```bash
bun run test              # unit tests, interactive watch mode
bun run test:ci           # unit tests, single run (used in CI)
bun run test:integration  # integration tests against real Postgres (Testcontainers, needs Docker)
bun run test:e2e          # end-to-end tests (Playwright), including accessibility checks
bun run lint
bun run format:check
bun run typecheck
```

**Docker is required to push.** `.husky/pre-push` runs integration tests via Testcontainers, which spin up a real Postgres instance in Docker. Make sure `docker ps` succeeds before running `git push`, or the hook fails with an unclear error.

Unit tests live in `__tests__/` and mirror the source structure (`lib/`, `api/`, `store/`). End-to-end tests live in `e2e/`. All CI checks (lint, typecheck, unit, integration, build, e2e) must pass before merge.

## Branch & commit conventions

Branch names: `feat/`, `fix/`, `chore/`, or `docs/` followed by a short kebab-case description (e.g. `feat/audio-recitation`).

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `fix(search): prevent focus loss when query is in-flight`).

**Do not add `Co-Authored-By` trailers to commits.** See the AI Attribution Policy below for what to use instead when disclosure is required.

## Code style

- **TypeScript strict mode** — no `any`, no `ts-ignore` without a comment explaining why.
- **No comments** unless the _why_ is non-obvious (a hidden constraint, a Quran API quirk, a security invariant).
- **No feature flags or backwards-compatibility shims** — change the code directly.
- **No error handling for impossible scenarios** — trust Next.js and TypeScript guarantees; only validate at system boundaries.
- File structure follows Next.js App Router conventions: API routes under `app/api/`, pages under `app/`, shared logic under `lib/`, Zustand stores under `store/`.
- Run `bun run lint` and `bun run format:check` before pushing; CI rejects lint/format failures.

## Theological standards

All AI prompts, divine name descriptions, and verse connections must:

1. **Stay within the Maturidi/Hanafi tradition** — this is the theological framework of the project. Don't introduce Ash'ari-only positions without noting the difference, and don't conflate schools.
2. **Maintain strict Tanzih (transcendence)** — never describe divine attributes in ways that imply physical form, spatial location, or resemblance to created things (Tashbih). The prompts in `app/api/connections/route.ts` include this constraint explicitly.
3. **Use verified verse references** — never fabricate a Quran verse reference. If a model returns a reference that cannot be verified via the alquran.cloud API, the system rejects it. In tests, use known valid refs (e.g. `2:255`, `1:1`, `112:1`).
4. **Handle Quranic text as sacred data** — even in test fixtures and mock data, use real or plausible Arabic text. Don't use placeholder strings like `"lorem ipsum"` for Arabic fields.
5. **Attribute translations correctly** — the project uses `en.sahih` (Saheeh International) from alquran.cloud. If you add a new translation source, document it clearly.

Describe the theological implications of any AI prompt change in the PR (see the "AI / Theological changes" section of the PR template).

## AI Attribution Policy

- **No `Co-Authored-By` trailers.** This repo does not use GitHub's co-author attribution for AI-assisted commits — it implies joint human authorship that doesn't apply here.
- **PR-level disclosure is required** for any change to Claude prompts, divine-name data, or theological framing — check the relevant box(es) in the PR template's "AI / Theological changes" section and describe the change.
- **Code-level disclosure for large AI-generated contributions.** When an agent generates a whole new file, or a block of roughly 30+ lines, with minimal human review or editing, the commit message must carry a `Generated-By: <tool-name>` trailer (e.g. `Generated-By: Claude Code`). This is a plain-text disclosure trailer, distinct from `Co-Authored-By` — it does not trigger GitHub's co-author UI. Don't add inline "AI-generated" comments in source files; that conflicts with the no-unnecessary-comments code style rule above. The commit trailer is the disclosure mechanism.
- **Condensed copies exist** in the tool-specific pointer files (`.github/copilot-instructions.md`, `.cursor/rules/agents.mdc`, `.windsurfrules`, `.clinerules`, `.aider.conf.yml`) for tools that can't import this file directly. If you change this policy, update those too — see the note in each file.

## Available tooling

MCP servers configured for this repo (`.mcp.json`, `.claude.json`): `codegraph` (tree-sitter-parsed knowledge graph of every symbol/edge/file) and `sequential-thinking`. If your agent supports MCP, prefer these over grep/read for structural questions. Claude Code-specific usage rules for CodeGraph live in `CLAUDE.md` — read that file if you're Claude Code; other MCP-capable agents should discover the same tools via their own MCP client.

## Reporting bugs / feature requests

Use the issue templates in `.github/ISSUE_TEMPLATE/`. For security vulnerabilities, email security@openhikmah.com instead of opening an issue — see `SECURITY.md`. Feature requests affecting how the Quran is presented or connected should include theological rationale.
