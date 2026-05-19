import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/bookmarks/route";
import { DELETE } from "@/app/api/bookmarks/[ref]/route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function authed(method = "GET", body?: object) {
  return new NextRequest("http://localhost/api/bookmarks", {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function unauthed() {
  return new NextRequest("http://localhost/api/bookmarks");
}

describe("GET /api/bookmarks", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns empty refs array when no token provided", async () => {
    const res = await GET(unauthed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.refs).toEqual([]);
  });

  it("returns refs when QF API responds with bookmarks array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bookmarks: [{ verse_key: "2:255" }, { verse_key: "1:1" }],
      }),
    });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.refs).toEqual(["2:255", "1:1"]);
  });

  it("normalises response using .data field when .bookmarks is absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ verse_key: "3:18" }],
      }),
    });
    const res = await GET(authed());
    const body = await res.json();
    expect(body.refs).toEqual(["3:18"]);
  });

  it("returns empty refs when QF API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const res = await GET(authed());
    const body = await res.json();
    expect(body.refs).toEqual([]);
  });

  it("returns empty refs when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const res = await GET(authed());
    const body = await res.json();
    expect(body.refs).toEqual([]);
  });
});

describe("POST /api/bookmarks", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns 401 when no token provided", async () => {
    const req = new NextRequest("http://localhost/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "2:255" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid verse ref format", async () => {
    const req = authed("POST", { ref: "invalid" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing ref", async () => {
    const req = authed("POST", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/bookmarks", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 ok when QF API accepts bookmark", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const req = authed("POST", { ref: "2:255" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("passes correct fields to QF API", async () => {
    let capturedBody: unknown;
    mockFetch.mockImplementationOnce(async (_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return { ok: true, json: async () => ({}) };
    });

    const req = authed("POST", { ref: "3:18" });
    await POST(req);

    expect(capturedBody).toMatchObject({
      verse_key: "3:18",
      chapter_number: 3,
      verse_number: 18,
    });
  });

  it("returns 400 when QF API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, text: async () => "error" });
    const req = authed("POST", { ref: "2:255" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/bookmarks/[ref]", () => {
  beforeEach(() => mockFetch.mockReset());

  function deleteReq(ref: string, withToken = true) {
    return new NextRequest(`http://localhost/api/bookmarks/${ref}`, {
      method: "DELETE",
      headers: withToken ? { Authorization: "Bearer test-token" } : {},
    });
  }

  it("returns 401 when no token provided", async () => {
    const req = deleteReq("2:255", false);
    const res = await DELETE(req, {
      params: Promise.resolve({ ref: "2%3A255" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 ok when QF API accepts deletion", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const req = deleteReq("2:255");
    const res = await DELETE(req, {
      params: Promise.resolve({ ref: "2%3A255" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 when QF API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const req = deleteReq("2:255");
    const res = await DELETE(req, {
      params: Promise.resolve({ ref: "2%3A255" }),
    });
    expect(res.status).toBe(400);
  });
});
