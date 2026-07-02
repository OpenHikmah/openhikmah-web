import { NextRequest, NextResponse } from "next/server";

/**
 * Small shared helpers so route handlers stay thin and consistent. The
 * `/api/connections` route is the reference standard: parse-guard the body,
 * validate inputs, and return a uniform `{ error }` envelope with the right
 * status. These helpers capture that pattern so every route applies it the
 * same way.
 */

/** Uniform error response: `{ error: message }` with the given status. */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse a JSON request body, returning `null` on malformed input so the caller
 * can respond with a 400 in one line:
 *
 *   const body = await parseJson<{ ref?: string }>(req);
 *   if (!body) return jsonError("Invalid request body", 400);
 */
export async function parseJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// IPv4/IPv6 characters only, capped at IPv6's max length. Guards against
// arbitrarily long / malformed x-forwarded-for values being persisted as
// rate-limit keys.
const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

/**
 * Best-effort client identifier for rate-limit bucketing. `x-real-ip` is set
 * by our nginx from `$remote_addr` (the actual TCP peer) and is always
 * overwritten by the proxy, so a client cannot forge it. `x-forwarded-for` is
 * built with `$proxy_add_x_forwarded_for`, which *appends* our proxy's view
 * of the client to whatever the client already sent — so the trustworthy
 * value is the *last* entry, not the first (the first entry is fully
 * attacker-controlled and would let a caller mint a fresh rate-limit bucket
 * on every request). Falls back to a single shared "unknown" bucket rather
 * than omitting the key: a paid path must always be rate-limited, even when
 * no usable IP is present.
 */
export function clientKey(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim() || "";
  if (IP_PATTERN.test(realIp)) return realIp;

  const fwd = req.headers.get("x-forwarded-for");
  const parts = fwd?.split(",").map((p) => p.trim()) ?? [];
  const candidate = parts[parts.length - 1] || "";
  return IP_PATTERN.test(candidate) ? candidate : "unknown";
}
