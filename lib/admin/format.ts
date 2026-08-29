/**
 * Human-readable summaries of the `/api/admin/infra` maintenance-action
 * responses, so the operator sees "Cleared 12 cached tokens." instead of a
 * raw `Done: {"action":"flush-tokens","cleared":12}` JSON dump.
 */

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
