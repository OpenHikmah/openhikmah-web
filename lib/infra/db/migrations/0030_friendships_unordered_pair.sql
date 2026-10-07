-- Rollback: DROP INDEX IF EXISTS "friendships_unordered_pair_idx"; (rows removed below are not restored)
-- The existing unique index is directional, so concurrent A->B and B->A requests could leave
-- two rows for one pair. Collapse any such duplicates first so the unordered index can be
-- built: keep one row per pair, preferring accepted, then pending, then the oldest.
DELETE FROM "friendships" f
USING (
  SELECT "id", row_number() OVER (
    PARTITION BY least("requester_id", "addressee_id"), greatest("requester_id", "addressee_id")
    ORDER BY ("status" = 'accepted') DESC, ("status" = 'pending') DESC, "id"
  ) AS rn
  FROM "friendships"
) d
WHERE f."id" = d."id" AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_unordered_pair_idx" ON "friendships" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));
