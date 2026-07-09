import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/infra/db/schema.ts",
  out: "./lib/infra/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://openh:placeholder@localhost:5432/open_hikmah",
  },
} satisfies Config;
