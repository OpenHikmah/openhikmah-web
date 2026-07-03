# Contributing to Open Hikmah

Thank you for your interest in contributing. Open Hikmah is a theological sensemaking tool for the Quran — contributions touch both code and sacred content, so please read this guide fully before opening a PR.

## Table of Contents

- [Getting Started](#getting-started)
- [Branch and Commit Conventions](#branch-and-commit-conventions)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Theological Standards](#theological-standards)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---
## Getting Started
```bash
git clone https://github.com/Nazm-AI/open-hikmah
cd open-hikmah
npm install
cp .env.example .env.local
# Fill in .env.local (see .env.example for instructions)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Required environment variables** — see [`.env.example`](.env.example). At minimum you need `ANTHROPIC_API_KEY` to test AI connections. The Quran Foundation OAuth variables are only needed to test bookmarks.

**Docker (required for pushing):** `.husky/pre-push` runs integration tests via [Testcontainers](https://testcontainers.com/), which spin up a real Postgres instance in Docker. Docker must be installed and running before you run `git push`, or the hook will fail with an unclear error. Install Docker Desktop (or Docker Engine on Linux) from the [official docs](https://docs.docker.com/get-docker/), and make sure the daemon is running (`docker ps` should succeed) before pushing.

---


## Branch and Commit Conventions

Branch names follow the pattern `feat/`, `fix/`, `chore/`, or `docs/` followed by a short kebab-case description:

```
feat/audio-recitation
fix/canvas-edge-overlap
chore/update-dependencies
docs/improve-readme
```

Commits use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(canvas): add edge label tooltip on hover
fix(search): prevent focus loss when query is in-flight
chore(deps): bump @anthropic-ai/sdk to 0.97.0
docs(names): add theological notes for Sifat al-Af'al
```

**Do not add `Co-Authored-By` lines** to commits.

---

## Running Tests

```bash
npm run test        # interactive watch mode
npm run test:ci     # single run (used in CI)
```

Tests live in `__tests__/` and mirror the source structure:

```
__tests__/
  lib/       # pure utility function tests
  api/       # Next.js route handler tests (fetch mocked)
  store/     # Zustand store tests
```

CI runs automatically on every push via GitHub Actions (`.github/workflows/ci.yml`). All tests must pass and the TypeScript build must succeed before a PR can be merged.

**When adding a new feature:**
- Add tests in the appropriate `__tests__/` subfolder
- API routes: mock `global.fetch` with `vi.stubGlobal`; mock `@anthropic-ai/sdk` if the route uses Claude
- Stores: reset state in `beforeEach`

---

## Code Style

- **TypeScript strict mode** — no `any`, no `ts-ignore` without a comment explaining why
- **No comments** unless the *why* is non-obvious (a hidden constraint, a Quran API quirk, a security invariant)
- **No feature flags or backwards-compatibility shims** — change the code directly
- **No error handling for impossible scenarios** — trust Next.js and TypeScript guarantees; only validate at system boundaries
- Run `npm run lint` before pushing; the CI will reject lint failures

File structure follows Next.js App Router conventions. New API routes go under `app/api/`, new pages under `app/`, shared logic under `lib/`, Zustand stores under `store/`.

---

## Theological Standards

All AI prompts, divine name descriptions, and verse connections must:

1. **Stay within the Maturidi/Hanafi tradition** — This is the theological framework of the project. Don't introduce Ash'ari-only positions without noting the difference, and don't conflate schools.

2. **Maintain strict Tanzih (transcendence)** — Never describe divine attributes in ways that imply physical form, spatial location, or resemblance to created things (Tashbih). The prompts in `app/api/connections/route.ts` include this constraint explicitly.

3. **Use verified verse references** — Never fabricate a Quran verse reference. If Claude returns a reference that cannot be verified via the alquran.cloud API, the system will reject it. In tests, use known valid refs (e.g. `2:255`, `1:1`, `112:1`).

4. **Handle Quranic text as sacred data** — Even in test fixtures and mock data, use real or plausible Arabic text. Don't use placeholder strings like `"lorem ipsum"` for Arabic fields.

5. **Attribute translations correctly** — The project uses `en.sahih` (Saheeh International) from alquran.cloud. If you add a new translation source, document it clearly.

---

## Submitting a Pull Request

1. Fork the repo and create your branch from `main`
2. Make your changes with tests
3. Ensure `npm run lint`, `npx tsc --noEmit`, and `npm run test:ci` all pass locally
4. Open a PR against `main` using the pull request template
5. Describe the theological implications of any AI prompt changes
6. A maintainer will review within a few days

For significant changes (new AI behaviour, new pages, changes to the PKCE flow), open an issue first to discuss the approach.

---

## Reporting Bugs

Use the [Bug Report issue template](.github/ISSUE_TEMPLATE/bug_report.md). For **security vulnerabilities**, email security@openhikmah.com instead — see [SECURITY.md](SECURITY.md).

## Feature Requests

Use the [Feature Request issue template](.github/ISSUE_TEMPLATE/feature_request.md). Please describe the theological rationale for any feature that affects how the Quran is presented or connected.
