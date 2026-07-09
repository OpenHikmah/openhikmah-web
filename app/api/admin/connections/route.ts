import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { connections } from "@/lib/infra/db/schema";

const STATUSES = ["active", "flagged", "retired"] as const;
const KINDS = ["thematic", "root", "contrast"] as const;
type Status = (typeof STATUSES)[number];

/** List AI connections with optional `?status=` / `?kind=` filters, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const kind = sp.get("kind");
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

  const filters: SQL[] = [];
  if (status) filters.push(eq(connections.status, status));
  if (kind) filters.push(eq(connections.kind, kind));

  const rows = await db
    .select()
    .from(connections)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(connections.createdAt))
    .limit(limit);

  return NextResponse.json({ connections: rows });
}

/** Change a connection's moderation status (active | flagged | retired). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { id?: number; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = body;
  const status = body.status as Status | undefined;
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
  }
  if (!status || !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [updated] = await db
    .update(connections)
    .set({ status })
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
