import { NextRequest, NextResponse } from "next/server";

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

    const data = await res.json();

    return NextResponse.json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
    });
  } catch (err) {
    console.error("Auth exchange error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
