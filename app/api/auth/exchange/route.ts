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
    // Step 1: Exchange code for tokens
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: process.env.NEXT_PUBLIC_QF_CLIENT_ID!,
      client_secret: process.env.QF_CLIENT_SECRET!,
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

    return NextResponse.json({
      accessToken,
      refreshToken,
      userId,
      username,
      isNewUser,
    });
  } catch (err) {
    console.error("Auth exchange error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
