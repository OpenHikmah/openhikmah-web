import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent skill examples — not project code
    ".agents/**",
    ".claude/**",
  ]),
  {
    // Recognize the underscore convention for intentionally-unused bindings
    // (common in mock factories / proxy traps), so --max-warnings=0 stays clean.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Design-system guardrail: colors live in tokens (app/globals.css @theme), never as
    // hardcoded hex in UI code. A literal hex is, per design.md §1, a bug. Use a token
    // class (text-gold, bg-surface) or a `var(--color-*)` / `color-mix(... var(--color-*))`
    // for genuinely dynamic styles. Catches both plain strings and template literals.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message:
            "No hardcoded hex colors in UI code — use a design token (e.g. text-gold, bg-surface) or var(--color-*). See app/globals.css and docs/design.md §1.",
        },
        {
          selector:
            "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message:
            "No hardcoded hex colors in UI code — use a design token (e.g. text-gold, bg-surface) or var(--color-*). See app/globals.css and docs/design.md §1.",
        },
      ],
    },
  },
]);

export default eslintConfig;
