function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `  Ensure ${name} is set in your .env file or environment.\n` +
        `  See .env.example or the project README for a list of required variables.`
    );
  }
  return value;
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const required: string[] = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_QF_CLIENT_ID",
  "NEXT_PUBLIC_QF_AUTH_BASE",
  "QF_CLIENT_SECRET",
  "QF_AUTH_BASE",
];

if (process.env.NODE_ENV === "production") {
  required.push("DATABASE_URL");
}

if (process.env.NODE_ENV !== "test" && process.env.VITEST === undefined) {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join("\n  ")}\n\n` +
        "These variables must be set before starting the application.\n" +
        "Create a .env file in the project root or set them in your shell."
    );
  }
}

export function getDbUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return requireEnv("DATABASE_URL");
  }
  return process.env.DATABASE_URL ?? "postgresql://openh:placeholder@localhost:5432/open_hikmah";
}

export function getAppUrl(): string {
  return requireEnv("NEXT_PUBLIC_APP_URL");
}

export function getQfClientId(): string {
  return requireEnv("NEXT_PUBLIC_QF_CLIENT_ID");
}

export function getQfClientSecret(): string {
  return requireEnv("QF_CLIENT_SECRET");
}

export function getQfAuthBase(): string {
  return requireEnv("QF_AUTH_BASE");
}

export function getQfAuthorizePath(): string {
  return env("NEXT_PUBLIC_QF_AUTHORIZE_PATH", "/oauth2/auth");
}

export function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL;
}

export function getAdminQfIds(): string[] {
  const raw = process.env.ADMIN_QF_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAiProvider(): "claude" | "gemini" {
  const provider = env("AI_PROVIDER", "claude") as "claude" | "gemini";
  if (provider !== "claude" && provider !== "gemini") {
    throw new Error(
      `AI_PROVIDER must be "claude" or "gemini", got "${provider}"`
    );
  }
  if (provider === "claude") {
    requireEnv("ANTHROPIC_API_KEY");
  } else {
    requireEnv("GEMINI_API_KEY");
  }
  return provider;
}

export function getAnthropicApiKey(): string {
  return requireEnv("ANTHROPIC_API_KEY");
}

export function getAnthropicModel(): string {
  return env("ANTHROPIC_MODEL", "claude-opus-4-7");
}

export function getGeminiApiKey(): string {
  return requireEnv("GEMINI_API_KEY");
}

export function getGeminiModel(): string {
  return env("GEMINI_MODEL", "gemini-2.0-flash");
}

export function getGeminiEmbeddingModel(): string {
  return env("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001");
}

export function getJwksUrl(): string {
  const explicit = process.env.QF_JWKS_URL;
  if (explicit) return explicit;
  const base = process.env.QF_AUTH_BASE;
  if (!base) return "";
  return `${base}/oauth2/jwks`;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
