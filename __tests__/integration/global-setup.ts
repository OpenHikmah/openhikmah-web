import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Type the value passed from globalSetup → tests via provide/inject.
declare module "vitest" {
  interface ProvidedContext {
    DATABASE_URL: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

interface SetupContext {
  provide: (key: "DATABASE_URL", value: string) => void;
}

export async function setup({ provide }: SetupContext) {
  // pgvector-enabled image (matches docker-compose) so migration 0008's
  // `CREATE EXTENSION vector` and the verse_embeddings vector column apply.
  container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = container.getConnectionUri();

  // Apply all Drizzle migrations to the fresh database.
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: join(process.cwd(), "lib/db/migrations"),
    });
  } finally {
    await sql.end();
  }

  // Hand the connection string to the worker (inject-env.ts reads it before
  // lib/db is imported and creates its client).
  provide("DATABASE_URL", url);
  process.env.DATABASE_URL = url;
}

export async function teardown() {
  await container?.stop();
}
