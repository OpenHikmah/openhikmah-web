import { NextResponse, type NextRequest } from "next/server";
import { incr } from "@/lib/infra/metrics";
import { clientKey } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";

// Browsers POST violation reports here; never cache.
export const dynamic = "force-dynamic";

// Reports are attacker-influenced (a page under CSP attack controls what gets
// reported) — cap body size defensively before parsing.
const MAX_BODY_BYTES = 32 * 1024;

// Unauthenticated, unbounded request rate otherwise — cap per-IP so an
// attacker can't drive unlimited log volume / ingestion cost via forged
// reports. Real violation volume per client is tiny (a handful per page load
// at most), so this only bites abuse.
const CSP_REPORT_LIMIT = 30;
const CSP_REPORT_WINDOW_SECONDS = 60;

/** Shape of a single entry in the modern `application/reports+json` batch format. */
interface ReportsApiEntry {
  type?: string;
  body?: Record<string, unknown>;
}

/**
 * Accepts CSP violation reports in both the legacy `application/csp-report`
 * format (single object under `csp-report`) and the modern Reporting API
 * `application/reports+json` format (array of report entries). Logs a
 * structured summary and bumps a counter; never reflects the payload back.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull(
    `csp-report:${clientKey(req)}`,
    "Too many requests",
    CSP_REPORT_LIMIT,
    CSP_REPORT_WINDOW_SECONDS
  );
  if (limited) return limited;

  const text = await readCappedBody(req, MAX_BODY_BYTES);
  if (text === null) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    incr("csp.violation.unparseable");
    return new NextResponse(null, { status: 204 });
  }

  const violations = extractViolations(parsed);
  for (const violation of violations) {
    incr("csp.violation");
    console.error("csp-violation", violation);
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * Reads the request body as a stream, aborting as soon as it exceeds
 * `maxBytes` instead of trusting the attacker-controlled `Content-Length`
 * header and materializing the full body before checking its size.
 */
async function readCappedBody(req: NextRequest, maxBytes: number): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function extractViolations(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    // application/reports+json: array of { type: "csp-violation", body: {...} }
    return (parsed as ReportsApiEntry[])
      .filter((entry) => entry?.type === "csp-violation" && entry.body)
      .map((entry) => entry.body as Record<string, unknown>);
  }
  if (parsed && typeof parsed === "object" && "csp-report" in parsed) {
    // application/csp-report: legacy { "csp-report": {...} }
    return [(parsed as { "csp-report": Record<string, unknown> })["csp-report"]];
  }
  return [];
}
