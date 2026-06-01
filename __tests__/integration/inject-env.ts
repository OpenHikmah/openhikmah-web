import { inject } from "vitest";

// Runs in the worker before any test module (and therefore before lib/db is
// imported), so the real container DATABASE_URL is in place when the db client
// is constructed.
process.env.DATABASE_URL = inject("DATABASE_URL");
