import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth/social-auth";

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
