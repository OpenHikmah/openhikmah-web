import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/audio/[surah]/[ayah]/route";
import { getAudioUrl } from "@/lib/quran/audio";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function params(surah: string, ayah: string) {
  return { params: Promise.resolve({ surah, ayah }) };
}

function call(surah: string, ayah: string, query = "") {
  return GET(
    new NextRequest(`http://localhost/api/audio/${surah}/${ayah}${query}`),
    params(surah, ayah)
  );
}

const mp3 = () => new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 });

describe("GET /api/audio/[surah]/[ayah]", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("streams the CDN file as an attachment credited to the default reciter", async () => {
    mockFetch.mockResolvedValue(mp3());
    const res = await call("2", "255");

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(getAudioUrl(2, 255, "ar.alafasy"));
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Mishary_Alafasy_002_255.mp3"'
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
  });

  it("uses the requested reciter in both the upstream URL and the filename", async () => {
    mockFetch.mockResolvedValue(mp3());
    const res = await call("1", "1", "?reciter=ar.husary");

    expect(mockFetch).toHaveBeenCalledWith(getAudioUrl(1, 1, "ar.husary"));
    expect(res.headers.get("Content-Disposition")).toContain("Mahmoud_Al_Husary_001_001.mp3");
  });

  it.each([
    ["0", "1"],
    ["115", "1"],
    ["1", "8"],
    ["2", "abc"],
    ["02", "255"],
  ])("rejects invalid ref %s:%s with 400 and never hits the CDN", async (s, a) => {
    const res = await call(s, a);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects an unknown reciter with 400 instead of silently defaulting", async () => {
    const res = await call("1", "1", "?reciter=https://evil.example/x");
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 502 when the CDN responds with an error", async () => {
    mockFetch.mockResolvedValue(new Response("nope", { status: 403 }));
    expect((await call("1", "1")).status).toBe(502);
  });

  it("returns 502 when the CDN fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    expect((await call("1", "1")).status).toBe(502);
  });
});
