import { NextRequest, NextResponse } from "next/server";
import { isValidRef } from "@/lib/quran/quran-corpus";
import {
  DEFAULT_RECITER,
  audioDownloadFilename,
  getAudioUrl,
  isValidReciter,
} from "@/lib/quran/audio";

// Same-origin passthrough of the CDN recitation file. The CDN sends no CORS
// header and the CSP blocks a browser fetch to it, so the client can't save it
// directly. The upstream URL is built only from a validated ref and a
// whitelisted reciter, so this can't be used as an open proxy.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah, ayah } = await params;
  if (!isValidRef(`${surah}:${ayah}`)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  const reciter = req.nextUrl.searchParams.get("reciter") ?? DEFAULT_RECITER;
  // 400, not a silent default: the user must never get a different reciter
  // than the one they chose.
  if (!isValidReciter(reciter)) {
    return NextResponse.json({ error: "Invalid reciter" }, { status: 400 });
  }

  const s = Number(surah);
  const a = Number(ayah);
  let upstream: Response;
  try {
    upstream = await fetch(getAudioUrl(s, a, reciter));
  } catch (err) {
    console.error("Audio upstream fetch failed", err);
    return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    console.error("Audio upstream returned", upstream.status);
    return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
  }

  // Bytes are streamed through unchanged: recitation is never re-encoded or trimmed.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="${audioDownloadFilename(s, a, reciter)}"`,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
