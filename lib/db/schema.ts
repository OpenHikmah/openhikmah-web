import {
  bigserial,
  check,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  unique,
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
    // 'pending' | 'active' | 'completed' | 'declined'
    status: text("status").notNull().default("pending"),
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

// ─── Exported types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type SharedCanvas = typeof sharedCanvases.$inferSelect;
export type VerseNote = typeof verseNotes.$inferSelect;
export type NewVerseNote = typeof verseNotes.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type SavedWorkspace = typeof savedWorkspaces.$inferSelect;
export type NewSavedWorkspace = typeof savedWorkspaces.$inferInsert;
