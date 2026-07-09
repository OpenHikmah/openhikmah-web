import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema";

const connectionString = process.env.DATABASE_URL;

// In production the DATABASE_URL must be set. In test environments it may be
// absent — guard here so the module can be imported without crashing.
if (!connectionString && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(
  connectionString ?? "postgresql://openh:placeholder@localhost:5432/open_hikmah",
  {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  }
);

export const db = drizzle(client, { schema });
