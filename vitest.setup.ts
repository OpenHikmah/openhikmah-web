import "@testing-library/jest-dom/vitest";

// Provide dummy env vars so API route modules load without throwing
process.env.NEXT_PUBLIC_QF_CLIENT_ID = "test-client-id";
process.env.QF_API_BASE = "https://api.test.qf.com";
process.env.QF_AUTH_BASE = "https://auth.test.qf.com";
process.env.QF_CLIENT_SECRET = "test-client-secret";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_QF_AUTH_BASE = "https://auth.test.qf.com";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.AI_PROVIDER ??= "claude";
process.env.GEMINI_API_KEY ??= "test-gemini-key-placeholder";
process.env.GEMINI_MODEL ??= "gemini-2.0-flash";
