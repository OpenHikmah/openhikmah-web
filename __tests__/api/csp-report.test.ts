import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/csp-report/route";

const MAX_BODY_BYTES = 32 * 1024;

function reqWithBody(body: string) {
  return new NextRequest("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "Content-Type": "application/csp-report" },
    body,
  });
}

/** A request whose declared Content-Length lies about the true body size. */
function reqWithSpoofedLength(body: string, declaredLength: number) {
  return new NextRequest("http://localhost/api/csp-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/csp-report",
      "Content-Length": String(declaredLength),
    },
    body,
  });
}

describe("POST /api/csp-report", () => {
  it("accepts a well-formed legacy csp-report", async () => {
    const res = await POST(
      reqWithBody(JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }))
    );
    expect(res.status).toBe(204);
  });

  it("accepts a well-formed reports+json batch", async () => {
    const res = await POST(
      reqWithBody(JSON.stringify([{ type: "csp-violation", body: { blockedURL: "x" } }]))
    );
    expect(res.status).toBe(204);
  });

  it("returns 204 (not an error) for unparseable JSON", async () => {
    const res = await POST(reqWithBody("not json"));
    expect(res.status).toBe(204);
  });

  it("treats a request with no body as an empty (unparseable) payload", async () => {
    const req = new NextRequest("http://localhost/api/csp-report", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  it("rejects a body over the size cap with 413", async () => {
    const oversized = "a".repeat(MAX_BODY_BYTES + 1);
    const res = await POST(reqWithBody(oversized));
    expect(res.status).toBe(413);
  });

  it("rejects an oversized body even when Content-Length under-reports the size", async () => {
    const oversized = "a".repeat(MAX_BODY_BYTES + 1);
    const res = await POST(reqWithSpoofedLength(oversized, 10));
    expect(res.status).toBe(413);
  });

  it("does not buffer past the cap: cancels the stream instead of reading it all", async () => {
    const chunkSize = 8 * 1024;
    let bytesPulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (cancelled) return;
        bytesPulled += chunkSize;
        controller.enqueue(new Uint8Array(chunkSize).fill(97));
      },
      cancel() {
        cancelled = true;
      },
    });

    const req = new NextRequest("http://localhost/api/csp-report", {
      method: "POST",
      duplex: "half",
      body: stream,
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(cancelled).toBe(true);
    // Cap is 32KB; should stop well before pulling e.g. 1MB of chunks.
    expect(bytesPulled).toBeLessThan(1024 * 1024);
  });
});
