import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth/social-auth";
import {
  rateLimitOrNull,
  ADMIN_MUTATION_LIMIT,
  ADMIN_MUTATION_WINDOW_SECONDS,
} from "@/lib/infra/rate-limit";
import { getFlagNumber } from "@/lib/admin/feature-flags";

/**
 * Single super-admin access control.
 *
 * Admins are defined by the `ADMIN_QF_IDS` env var: a comma-separated allowlist
 * of QF user ids (the `sub` / `qf_id`). This is deliberately env-based rather than
 * a DB role column — there is exactly one operator, no invite flow, and an env
 * allowlist can't be escalated by anything inside the app.
 *
 * FAIL-CLOSED: an unset or empty allowlist means *nobody* is an admin, so a
 * misconfigured deploy locks the panel rather than opening it.
 */

let cachedRaw: string | undefined;
let cachedSet: Set<string> = new Set();

/** Parsed allowlist, memoised per distinct env value (cheap, handles hot reload). */
function adminIds(): Set<string> {
  const raw = process.env.ADMIN_QF_IDS ?? "";
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSet = new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  return cachedSet;
}

/** True iff the given QF id is in the admin allowlist. */
export function isAdminQfId(qfId: string | null | undefined): boolean {
  if (!qfId) return false;
  return adminIds().has(qfId);
}

/**
 * Resolves the caller and asserts they are an admin. Returns `{ userId, user }`
 * on success or a `NextResponse` (401 if not signed in, 404 if signed in but not
 * an admin — we don't reveal the surface) that the route should return directly.
 * Every `/api/admin/*` route
 * MUST call this — it is the real security boundary, since the admin UI itself is
 * client-rendered and cannot be trusted.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthedUser | NextResponse> {
  const result = await requireUser(req);
  if (result instanceof NextResponse) return result; // 401 / disabled

  if (!isAdminQfId(result.user.qfId)) {
    // 404, not 403 — don't confirm the admin surface exists to a normal user.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return result;
}

/**
 * Rate-limits an already-authenticated admin's mutating requests (POST/PUT/
 * PATCH/DELETE) against a single shared budget across every `/api/admin/*`
 * route — a leaked admin bearer token otherwise has no throttle on high-
 * privilege actions (disable a user, delete a challenge, change flags, ...).
 * Uses the admin-only budget (`ADMIN_MUTATION_*` / the `admin_mutation_limit` /
 * `admin_mutation_window_seconds` flags), not the end-user mutation pool — an
 * operator clearing a moderation queue bursts far more writes than any normal
 * user. Read-only GETs are deliberately not limited. Call right after
 * `requireAdmin` succeeds, before doing any work:
 *
 *   const auth = await requireAdmin(req);
 *   if (auth instanceof NextResponse) return auth;
 *   const limited = await rateLimitAdminMutation(auth);
 *   if (limited) return limited;
 */
export async function rateLimitAdminMutation(auth: AuthedUser): Promise<NextResponse | null> {
  const [limit, windowSeconds] = await Promise.all([
    getFlagNumber("admin_mutation_limit", ADMIN_MUTATION_LIMIT),
    getFlagNumber("admin_mutation_window_seconds", ADMIN_MUTATION_WINDOW_SECONDS),
  ]);
  return rateLimitOrNull(
    `admin-mutation:${auth.userId}`,
    "Too many admin actions — try again in a moment",
    limit,
    windowSeconds
  );
}

/**
 * Budget for the writes an otherwise read-only admin GET performs as a
 * self-heal side effect (finalizing challenges that ended since the last view).
 * Kept on its own key so a burst of overdue challenges surfacing on a list
 * refresh can't consume the interactive `rateLimitAdminMutation` budget and
 * then block the operator's actual moderation clicks — or the list load itself.
 */
export async function rateLimitAdminSelfHeal(auth: AuthedUser): Promise<NextResponse | null> {
  return rateLimitOrNull(
    `admin-selfheal:${auth.userId}`,
    "Too many challenge finalizations — try again in a moment",
    ADMIN_MUTATION_LIMIT,
    ADMIN_MUTATION_WINDOW_SECONDS
  );
}
