import "@testing-library/jest-dom/vitest";

// Node ≥22 requires --localstorage-file for jsdom to expose localStorage.
// Provide a minimal in-memory polyfill so tests that call localStorage.clear()
// (e.g. the auth store and CanvasTour tests) don't crash.
if (typeof globalThis.localStorage === "undefined" || globalThis.localStorage === null) {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
  } as Storage;
}

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
