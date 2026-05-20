import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "qf_refresh_token";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const tokenUrl = `${process.env.QF_AUTH_BASE}/oauth2/token`;
  const clientId = process.env.NEXT_PUBLIC_QF_CLIENT_ID!;
  const clientSecret = process.env.QF_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
      response.cookies.delete(COOKIE_NAME);
      return response;
    }

    const data = await res.json() as { access_token: string; refresh_token?: string };
    const response = NextResponse.json({ accessToken: data.access_token });

    // Rotate cookie if server issues a new refresh token; otherwise re-stamp the existing one
    response.cookies.set(COOKIE_NAME, data.refresh_token ?? refreshToken, cookieOptions(60 * 60 * 24 * 30));
    return response;
  } catch {
    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}
