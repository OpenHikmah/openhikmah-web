import type { ReactElement } from "react";

/**
 * Shared renderer for Open Graph share images (next/og + Satori). Satori cannot
 * resolve CSS variables, so the palette is inlined here as literal hex — this is
 * the one sanctioned place for it (lib/ is outside the no-hex UI guardrail).
 * Keep these values in sync with the tokens in app/globals.css. Latin text uses
 * ImageResponse's built-in font; Arabic is intentionally omitted for now (it would
 * need an embedded Amiri font) — a future enhancement.
 */

const PALETTE = {
  bg: "#0a0f1a",
  gold: "#c9a84c",
  teal: "#0d9488",
  textPrimary: "#f0f4f8",
  textSecondary: "#8899aa",
  textMuted: "#4a5a6a",
} as const;

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export interface OgCardOptions {
  eyebrow: string;
  refPill?: string;
  title?: string;
  body: string;
  footer?: string;
}

/** A palette-styled 1200×630 card: gold top rule, eyebrow + ref, title, body, brand footer. */
export function renderOgCard({
  eyebrow,
  refPill,
  title,
  body,
  footer = "Open Hikmah · openhikmah.com",
}: OgCardOptions): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PALETTE.bg,
        color: PALETTE.textPrimary,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 10, background: PALETTE.gold }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "72px 80px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span
              style={{
                fontSize: 22,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: PALETTE.textMuted,
              }}
            >
              {eyebrow}
            </span>
            {refPill ? (
              <span
                style={{
                  display: "flex",
                  fontSize: 22,
                  color: PALETTE.gold,
                  border: `1px solid ${PALETTE.gold}`,
                  borderRadius: 8,
                  padding: "4px 14px",
                }}
              >
                {refPill}
              </span>
            ) : null}
          </div>

          {title ? (
            <span style={{ fontSize: 38, color: PALETTE.textSecondary, marginTop: 22 }}>
              {title}
            </span>
          ) : null}

          <span
            style={{ fontSize: 54, lineHeight: 1.25, color: PALETTE.textPrimary, marginTop: 26 }}
          >
            {body}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 14,
              height: 14,
              borderRadius: 999,
              background: PALETTE.teal,
            }}
          />
          <span style={{ fontSize: 26, color: PALETTE.textSecondary }}>{footer}</span>
        </div>
      </div>
    </div>
  );
}

/** Trim long body copy so it fits the card without overflow. */
export function clampBody(text: string, max = 180): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}
