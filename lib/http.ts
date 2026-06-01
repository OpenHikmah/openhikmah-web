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
