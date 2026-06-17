import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveQfId } from "@/lib/social-auth";

function generateUsername(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `user_${suffix}`;
}

export async function POST(req: NextRequest) {
  let body: { code?: string; codeVerifier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { code, codeVerifier } = body;
  if (!code || !codeVerifier) {
    return NextResponse.json({ error: "Missing code or codeVerifier" }, { status: 400 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/callback`;
  const tokenUrl = `${process.env.QF_AUTH_BASE}/oauth2/token`;

  try {
    // Step 1: Exchange code for tokens.
    // Confidential clients must authenticate via HTTP Basic Auth (RFC 6749 §2.3.1 / Ory Hydra
    // requirement). client_id and client_secret must NOT appear in the form body.
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const clientId = process.env.NEXT_PUBLIC_QF_CLIENT_ID!;
    const clientSecret = process.env.QF_CLIENT_SECRET!;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Token exchange failed:", res.status, text);
      return NextResponse.json({ error: "Token exchange failed" }, { status: 400 });
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
    };
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token ?? null;
    const COOKIE_NAME = "qf_refresh_token";

    // No refresh token ⇒ the session cookie can't be set, so the user is logged
    // out on the next reload. This almost always means `offline_access` wasn't in
    // the requested/granted scope. Surface it loudly instead of failing silently.
    if (!refreshToken) {
      console.warn(
        "Auth exchange returned no refresh_token — session will not survive reload. " +
        "Check the OAuth scope includes 'offline_access' and the client is allowed it."
      );
    }

    // Step 2: Resolve QF user identity and upsert our user record.
    // If this fails (QF userinfo unreachable), degrade gracefully — tokens
    // still work for bookmarks; social features will be unavailable.
    let userId: number | null = null;
    let username: string | null = null;
    let isNewUser = false;

    try {
      const qfId = await resolveQfId(accessToken);
      if (qfId) {
        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.qfId, qfId))
          .limit(1);

        if (existing) {
          // Update last seen
          await db
            .update(users)
            .set({ lastActiveAt: new Date() })
            .where(eq(users.id, existing.id));

          userId = existing.id;
          username = existing.username;
        } else {
          // New user — generate a placeholder username
          let newUsername = generateUsername();
          // Retry on the rare collision
          for (let attempt = 0; attempt < 3; attempt++) {
            const collision = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.username, newUsername))
              .limit(1);
            if (collision.length === 0) break;
            newUsername = generateUsername();
          }

          const [inserted] = await db
            .insert(users)
            .values({ qfId, username: newUsername })
            .returning();

          userId = inserted.id;
          username = inserted.username;
          isNewUser = true;
        }
      }
    } catch (err) {
      // Non-fatal — social features degrade, auth still works
      console.error("Social profile upsert failed (non-fatal):", err);
    }

    const response = NextResponse.json({ accessToken, userId, username, isNewUser });

    // Refresh token goes in an HttpOnly cookie — never exposed to JS (XSS-safe).
    if (refreshToken) {
      response.cookies.set(COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (err) {
    console.error("Auth exchange error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
