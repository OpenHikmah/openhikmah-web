import { NextResponse, type NextRequest } from "next/server";
import { incr } from "@/lib/infra/metrics";

// Browsers POST violation reports here; never cache.
export const dynamic = "force-dynamic";

// Reports are attacker-influenced (a page under CSP attack controls what gets
// reported) — cap body size defensively before parsing.
const MAX_BODY_BYTES = 32 * 1024;

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
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
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
