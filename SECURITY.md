# Security Policy

## Supported Versions

| Version         | Supported           |
| --------------- | ------------------- |
| `main` (latest) | ✅                  |
| Older branches  | ❌ — please upgrade |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately by emailing **security@openhikmah.com**. Include:

1. A description of the vulnerability and its potential impact
2. Steps to reproduce (proof-of-concept code is welcome)
3. Any suggested mitigations if you have them

You will receive an acknowledgement within **48 hours** and a resolution update within **7 days**. We will coordinate disclosure with you before publishing any fix.

## Scope

The following are **in scope**:

- API route injection or authentication bypass (`app/api/**`)
- OAuth2 PKCE flow vulnerabilities (CSRF, token leakage)
- Exposure of `ANTHROPIC_API_KEY`, `QF_CLIENT_SECRET`, or user access tokens
- Cross-site scripting (XSS) via verse/search content rendered in the browser
- Server-side request forgery (SSRF) in routes that proxy to external APIs
- Dependency vulnerabilities with a CVSS score ≥ 7.0

The following are **out of scope**:

- Denial-of-service via excessive AI expansion calls (rate limiting is a roadmap item)
- Theoretical vulnerabilities with no practical exploit path
- Issues in third-party services (Quran Foundation API, alquran.cloud, Anthropic)

## Security Architecture Notes

- **Tokens in memory only** — `accessToken` and `refreshToken` are never written to `localStorage` or cookies; they live only in Zustand in-memory state (see `store/auth.ts`)
- **PKCE state validation** — The `state` parameter is verified in `app/callback/CallbackClient.tsx` before the code exchange to prevent login CSRF
- **Server-side secret handling** — `QF_CLIENT_SECRET` and `ANTHROPIC_API_KEY` are only accessed in server-side API routes, never exposed to the client bundle
- **Input validation** — All user-supplied verse refs are validated against `/^\d+:\d+$/` before being used in external API URLs
- **HTML sanitization** — Search snippets from api.quran.com are passed through `sanitize-html` before rendering

## Responsible Disclosure

We follow a **90-day coordinated disclosure** policy. If a fix cannot be shipped within 90 days, we will communicate the timeline and reason. We will credit reporters in the security advisory unless they request anonymity.
