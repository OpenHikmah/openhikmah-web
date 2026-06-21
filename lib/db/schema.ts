import {
  bigserial,
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    qfId: text("qf_id").notNull().unique(),
    username: text("username").notNull().unique(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActivityDate: date("last_activity_date"),
    // Soft-disable seam for admin moderation. Null = active; a timestamp marks
    // when an admin disabled the account. Disabled users keep their data but are
    // rejected at the auth boundary (see requireUser / lib/admin-auth.ts).
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_qf_id_idx").on(t.qfId),
    uniqueIndex("users_username_idx").on(t.username),
    index("users_last_active_idx").on(t.lastActiveAt),
  ]
);

// ─── Friendships ──────────────────────────────────────────────────────────────

export const friendships = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    requesterId: integer("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: integer("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'pending' | 'accepted' | 'declined'
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("friendships_pair_idx").on(t.requesterId, t.addresseeId),
    index("friendships_addressee_status_idx").on(t.addresseeId, t.status),
    index("friendships_requester_status_idx").on(t.requesterId, t.status),
    check("no_self_friendship", sql`${t.requesterId} != ${t.addresseeId}`),
  ]
);

// ─── Activity Log ─────────────────────────────────────────────────────────────

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'verse_added' | 'connection_made' | 'hadith_read'
    activityType: text("activity_type").notNull(),
    verseRef: text("verse_ref"),
    activityDate: date("activity_date").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_user_date_idx").on(t.userId, t.activityDate),
    index("activity_user_type_date_idx").on(t.userId, t.activityType, t.activityDate),
  ]
);

// ─── Challenge Suggestions ────────────────────────────────────────────────────
// Admin-curated catalog of challenge ideas. Users browse the active ones on the
// challenges tab and pick one to challenge a friend — the 1v1 mechanics are
// unchanged; a suggestion just seeds the create flow (like Verse of the Day
// curation). Only `connection_made` activity is wired today.

export const challengeSuggestions = pgTable(
  "challenge_suggestions",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    verseRef: text("verse_ref"),
    // Suggested '24h' | '48h' | '7d', or null to let the user choose.
    suggestedDuration: text("suggested_duration"),
    activityType: text("activity_type").notNull().default("connection_made"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by"), // admin qfId
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("challenge_suggestions_active_idx").on(t.isActive, t.sortOrder)]
);

// ─── Challenges ───────────────────────────────────────────────────────────────

export const challenges = pgTable(
  "challenges",
  {
    id: serial("id").primaryKey(),
    challengerId: integer("challenger_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    challengedId: integer("challenged_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verseRef: text("verse_ref"),
    activityType: text("activity_type").notNull().default("connection_made"),
    // 'pending' | 'active' | 'completed' | 'declined' | 'cancelled'
    status: text("status").notNull().default("pending"),
    // Attribution: which curated suggestion (if any) seeded this challenge.
    suggestionId: integer("suggestion_id").references(() => challengeSuggestions.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    winnerId: integer("winner_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("challenges_challenger_status_idx").on(t.challengerId, t.status),
    index("challenges_challenged_status_idx").on(t.challengedId, t.status),
    index("challenges_ends_at_idx").on(t.endsAt),
    check("no_self_challenge", sql`${t.challengerId} != ${t.challengedId}`),
  ]
);

// ─── Shared Canvases ──────────────────────────────────────────────────────────

export const sharedCanvases = pgTable("shared_canvases", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Saved Workspaces ─────────────────────────────────────────────────────────

export const savedWorkspaces = pgTable(
  "saved_workspaces",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: text("data").notNull(),
    nodeCount: integer("node_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("saved_workspaces_user_idx").on(t.userId),
  ]
);

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verseRef: text("verse_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("bookmarks_user_ref_uniq").on(t.userId, t.verseRef),
    index("bookmarks_user_idx").on(t.userId),
  ]
);

// ─── Verse Notes ──────────────────────────────────────────────────────────────

export const verseNotes = pgTable(
  "verse_notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verseRef: text("verse_ref").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("verse_notes_user_ref_idx").on(t.userId, t.verseRef),
  ]
);

// ─── Quran Corpus (local) ─────────────────────────────────────────────────────
// The full Quran, seeded once. Replaces per-request fetches to alquran.cloud /
// quran.com — see lib/quran-corpus.ts. Keyed by "surah:ayah".

// Surah names are derived at read time from lib/surah-names.ts (single source of
// truth) rather than duplicated per row — see lib/quran-corpus.ts.
export const verses = pgTable(
  "verses",
  {
    ref: text("ref").primaryKey(),
    surah: integer("surah").notNull(),
    ayah: integer("ayah").notNull(),
    arabicText: text("arabic_text").notNull(),
    translation: text("translation").notNull(),
    transliteration: text("transliteration"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("verses_surah_ayah_idx").on(t.surah, t.ayah),
  ]
);

// ─── Connection Graph (the persistent knowledge graph) ────────────────────────
// Each row is an AI-generated edge between two verses. Written once on a cache
// miss (see lib/graph-service.ts) and shared by every subsequent reader, so AI
// cost trends toward zero as the graph fills.

export const connections = pgTable(
  "connections",
  {
    id: serial("id").primaryKey(),
    fromRef: text("from_ref").notNull(),
    toRef: text("to_ref").notNull(),
    // 'thematic' | 'root' | 'contrast'
    kind: text("kind").notNull(),
    reason: text("reason").notNull(),
    model: text("model"),
    confidence: integer("confidence"),
    // 'active' | 'flagged' | 'retired' — lets edges be soft-deactivated without schema change
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connections_from_to_kind_idx").on(t.fromRef, t.toRef, t.kind),
    index("connections_from_kind_idx").on(t.fromRef, t.kind),
  ]
);

// ─── AI Generation Log ────────────────────────────────────────────────────────
// Lightweight cost/audit trail: one row per actual AI generation (cache miss).
// How we measure the bill flattening over time.

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fromRef: text("from_ref").notNull(),
    kind: text("kind").notNull(),
    model: text("model"),
    tokens: integer("tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_generations_created_idx").on(t.createdAt),
  ]
);

// ─── Rate Limits ──────────────────────────────────────────────────────────────
// Fixed-window counter (no Redis). One row per (key, time-bucket); guards the
// expensive AI generation path. See lib/rate-limit.ts.

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Verse Embeddings (semantic search) ───────────────────────────────────────
// One vector per verse, produced once by scripts/embed-corpus.mjs via Gemini.
// Powers "search by meaning" and "find similar verses", and supplies the real
// thematic/contrast candidates for grounded connection discovery (data discovers,
// AI articulates). Requires the pgvector extension — see migration 0008.

export const verseEmbeddings = pgTable(
  "verse_embeddings",
  {
    ref: text("ref").primaryKey(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("verse_embeddings_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);

// ─── Word Morphology (grounded root discovery) ────────────────────────────────
// One row per word per verse: its Arabic root + lemma. Seeded once by
// scripts/seed-morphology.mjs. Makes "verses sharing a root" a local SQL query,
// so root connections are discovered from real data instead of the model's memory.

export const wordMorphology = pgTable(
  "word_morphology",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ref: text("ref").notNull(),
    position: integer("position").notNull(),
    surface: text("surface").notNull(),
    root: text("root"),
    lemma: text("lemma"),
  },
  (t) => [
    uniqueIndex("word_morphology_ref_pos_idx").on(t.ref, t.position),
    index("word_morphology_ref_idx").on(t.ref),
    index("word_morphology_root_idx").on(t.root),
  ]
);

// ─── Name Content (AI-generated 99-Names content cache) ───────────────────────
// Durable write-once/read-many cache for the per-name AI output (verses,
// reflection, pairings). Replaces Next's non-durable `unstable_cache` so Claude
// (and the quran.com search) runs at most once per name per prompt `version`,
// instead of re-running after every redeploy. Same pattern as `connections`.
// `data` is the JSON-encoded payload for that (slug, kind); `version` lets a
// prompt change force regeneration by bumping the per-kind constant in code.

/** The kinds of AI content cached per name. Single source of truth for the
 *  `name_content.kind` column and the `lib/name-content.ts` helper. */
export type NameContentKind = "verses" | "reflection" | "pairings";

export const nameContent = pgTable(
  "name_content",
  {
    slug: text("slug").notNull(),
    kind: text("kind").$type<NameContentKind>().notNull(),
    data: text("data").notNull(),
    model: text("model"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.slug, t.kind] })]
);

// ─── Curated Verse of the Day ─────────────────────────────────────────────────
// Admin override for the daily verse, keyed by UTC date. When a row exists for a
// day, it wins over the deterministic algorithmic pick (see lib/verse-of-day.ts).
// `reflection` is optional editorial text rendered in the teal ReflectionNote.

export const curatedVotd = pgTable("curated_votd", {
  // UTC day, "YYYY-MM-DD". One curated verse per day.
  date: date("date").primaryKey(),
  verseRef: text("verse_ref").notNull(),
  reflection: text("reflection"),
  // QF id of the admin who set it (audit convenience; full trail in admin_audit_log).
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Admin Audit Log ──────────────────────────────────────────────────────────
// Append-only record of every mutating admin action, so the console polices
// itself. `meta` holds action-specific detail (old/new values, filters, etc.).

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminQfId: text("admin_qf_id").notNull(),
    // e.g. 'votd.set' | 'votd.clear' | 'connection.status' | 'user.disable'
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: text("meta"), // JSON-encoded payload
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt)]
);

// ─── Feature Flags / Config ───────────────────────────────────────────────────
// Key→JSON config the admin can tune at runtime (rate-limit windows, AI model per
// connection kind, feature toggles). Read by the relevant subsystem; absence of a
// key means "use the code default", so this never has to be fully populated.

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type ChallengeSuggestion = typeof challengeSuggestions.$inferSelect;
export type NewChallengeSuggestion = typeof challengeSuggestions.$inferInsert;
export type SharedCanvas = typeof sharedCanvases.$inferSelect;
export type VerseNote = typeof verseNotes.$inferSelect;
export type NewVerseNote = typeof verseNotes.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type SavedWorkspace = typeof savedWorkspaces.$inferSelect;
export type NewSavedWorkspace = typeof savedWorkspaces.$inferInsert;
export type VerseRow = typeof verses.$inferSelect;
export type NewVerseRow = typeof verses.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type AiGeneration = typeof aiGenerations.$inferSelect;
export type NewAiGeneration = typeof aiGenerations.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
export type VerseEmbedding = typeof verseEmbeddings.$inferSelect;
export type NewVerseEmbedding = typeof verseEmbeddings.$inferInsert;
export type WordMorphology = typeof wordMorphology.$inferSelect;
export type NewWordMorphology = typeof wordMorphology.$inferInsert;
export type NameContent = typeof nameContent.$inferSelect;
export type NewNameContent = typeof nameContent.$inferInsert;
export type CuratedVotd = typeof curatedVotd.$inferSelect;
export type NewCuratedVotd = typeof curatedVotd.$inferInsert;
export type AdminAuditEntry = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditEntry = typeof adminAuditLog.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
