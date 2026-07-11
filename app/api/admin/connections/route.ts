import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { connections } from "@/lib/infra/db/schema";

const STATUSES = ["active", "flagged", "retired"] as const;
const KINDS = ["thematic", "root", "contrast"] as const;
const REVIEWED_FILTERS = ["pending", "reviewed"] as const;
type Status = (typeof STATUSES)[number];

/** List AI connections with optional `?status=` / `?kind=` / `?reviewed=` filters, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const kind = sp.get("kind");
  const reviewed = sp.get("reviewed");
  const limitParam = Number(sp.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;

  // Reject unknown filter values rather than silently ignoring them, so a
  // typo'd query surfaces as a 400 instead of unfiltered results.
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  if (kind && !(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid kind filter" }, { status: 400 });
  }
  if (reviewed && !(REVIEWED_FILTERS as readonly string[]).includes(reviewed)) {
    return NextResponse.json({ error: "Invalid reviewed filter" }, { status: 400 });
  }

  const filters: SQL[] = [];
  if (status) filters.push(eq(connections.status, status));
  if (kind) filters.push(eq(connections.kind, kind));
  if (reviewed === "pending") filters.push(isNull(connections.reviewedAt));
  if (reviewed === "reviewed") filters.push(isNotNull(connections.reviewedAt));

  try {
    const rows = await db
      .select()
      .from(connections)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(connections.createdAt))
      .limit(limit);

    return NextResponse.json({ connections: rows });
  } catch (err) {
    console.error("admin connections GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Change a connection's moderation status (active | flagged | retired), or
 * mark it reviewed without changing status (`{ id, reviewed: true }`) — the
 * "looked at it, it's fine as-is" case. A status change always stamps
 * reviewedAt too, since moderating a row is itself a review.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  let body: { id?: number; status?: string; reviewed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, reviewed } = body;
  const status = body.status as Status | undefined;
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
  }

  if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (status === undefined && reviewed !== true) {
    return NextResponse.json({ error: "Must specify status or reviewed" }, { status: 400 });
  }

  try {
    if (status !== undefined) {
      const [updated] = await db
        .update(connections)
        .set({ status, reviewedAt: new Date(), reviewedBy: auth.user.qfId })
        .where(eq(connections.id, id as number))
        .returning();

      if (!updated) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }

      await logAdminAction({
        adminQfId: auth.user.qfId,
        action: "connection.status",
        targetType: "connection",
        targetId: String(id),
        meta: { status, fromRef: updated.fromRef, toRef: updated.toRef, kind: updated.kind },
      });

      return NextResponse.json({ connection: updated });
    }

    const [updated] = await db
      .update(connections)
      .set({ reviewedAt: new Date(), reviewedBy: auth.user.qfId })
      .where(eq(connections.id, id as number))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "connection.reviewed",
      targetType: "connection",
      targetId: String(id),
      meta: { fromRef: updated.fromRef, toRef: updated.toRef, kind: updated.kind },
    });

    return NextResponse.json({ connection: updated });
  } catch (err) {
    console.error("admin connections PATCH db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
