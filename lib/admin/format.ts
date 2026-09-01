/**
 * Human-readable summaries of the `/api/admin/infra` maintenance-action
 * responses, so the operator sees "Cleared 12 cached tokens." instead of a
 * raw `Done: {"action":"flush-tokens","cleared":12}` JSON dump.
 */

/**
 * The one timestamp format for admin tables (audit, prompts, connections,
 * flags, users) — date + short time, so "when" is never ambiguous between a
 * date-only and a date-time column.
 */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface InfraResult {
  action?: string;
  cleared?: number;
  deleted?: number;
  ok?: boolean;
}

export function formatInfraResult(res: InfraResult): string {
  switch (res.action) {
    case "flush-tokens":
      return `Cleared ${res.cleared ?? 0} cached token${res.cleared === 1 ? "" : "s"}.`;
    case "flush-jwks":
      return "JWKS cache flushed.";
    case "reset-ratelimits":
      return `Deleted ${res.deleted ?? 0} rate-limit row${res.deleted === 1 ? "" : "s"}.`;
    default:
      return "Done.";
  }
}
