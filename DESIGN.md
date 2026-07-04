# Design System: Open Hikmah

> Source of truth for generating new Open Hikmah screens in Google Stitch. Encodes the
> existing navy/gold/teal palette and type system — **match these values exactly**; do not
> introduce new colors or fonts. Token values mirror `app/globals.css` `@theme`; see
> `docs/design.md` for the full interaction spec.

---

## 1. Visual Theme & Atmosphere

A dark, reverent, gallery-airy interface for exploring the Qur'an as a connected graph. The
mood is calm and contemplative — a deep navy field that recedes so the sacred text and its
connections lead. Confident gold marks brand and identity; a restrained teal carries action.
Surfaces are **quiet by default**, warming to a soft palette-derived wash only on interaction.
Nothing shouts. Density is balanced-to-airy (≈4/10); variance is moderate (panels and canvas,
not chaotic); motion is fluid but brief. Think a well-lit manuscript study at night, not a SaaS
dashboard.

---

## 2. Color Palette & Roles

Single palette across every surface — never fluctuate warm/cool between screens.

- **Deep Navy** (`#0a0f1a`) — primary background / canvas field; the page base and all top chrome (headers).
- **Surface** (`#111827`) — raised panels, cards, sidebars, command palette.
- **Surface Raised** (`#1a2233`) — nested surfaces, hover rows, node bodies.
- **Surface Overlay** (`#1e2d40`) — floating menus, dropdowns, popovers.
- **Border** (`#1f2d3d`) — 1px structural separators; the primary way surfaces are distinguished (not shadow).
- **Border Subtle** (`#162130`) — faint internal dividers.
- **Text Primary** (`#f0f4f8`) — headings and body.
- **Text Secondary** (`#8899aa`) — descriptions, metadata, resting icon color.
- **Text Muted** (`#4a5a6a`) — eyebrows, captions, disabled.
- **Gold** (`#c9a84c`) — brand accent: logo, primary CTAs, focus ring, "root" relationships. (Muted variant `#8a6d2c` for hover borders.)
- **Teal** (`#0d9488`) — the single interaction accent: actions, success ("copied/saved"), "theme" relationships. (Dim variant `#0f766e`.)
- **Error** (`#e05252`) — destructive/failure only.

**Interaction washes** (soft, palette-derived; the relaxed border-only rule): neutral
`color-mix(#ffffff 6%, transparent)`, gold `color-mix(#c9a84c 14%, transparent)`, teal
`color-mix(#0d9488 16%, transparent)`.

**Data-viz reservation:** the semantic graph-edge colors — theme `#0d9488`, root `#c9a84c`,
contrast `#e05252` — are reserved for connection edges and their legend. Never use them as
generic UI chrome.

Constraints (already satisfied — keep it that way): never pure black `#000000`; gold and teal
are both under 80% saturation; **no purple, no neon, no outer-glow shadows, no gradient text.**

---

## 3. Typography Rules

- **UI / Display:** **Geist** — track-tight, hierarchy through weight and color, not huge size. Headlines scale with `clamp()`; wordmark is 15px / 600.
- **Mono / Labels:** **Geist Mono** — verse refs (`2:255`), eyebrows, taxonomy labels, metadata; uppercase small caps with `letter-spacing: .18–.32em`.
- **Arabic / Sacred:** **Amiri** — the one permitted distinctive serif, RTL, always `dir="rtl"`, **never below 16px** (node Arabic ~17px/lh 2; reading Arabic ≥21px/lh 2.05).
- **Body:** Geist, relaxed leading, ~65ch max line length, `--color-text-secondary`.
- **Banned:** Inter; generic system serifs (Times New Roman, Georgia, Garamond); any serif other than Amiri.

Type scale (rem): `0.6875 · 0.75 · 0.8125 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.375`.

---

## 4. Component Stylings

- **Buttons:** flat, no outer glow. **Primary** = filled gold, ink (`#0a0f1a`) text — one per context. **Secondary** = outline, gold on hover. **Ghost** = text-only for low-stakes. Tactile feedback on active (subtle inset, no bounce).
- **Icon buttons:** 36px visual (32px when nested) with a ≥44px hit area; resting icon `--color-text-secondary` (legible at rest); hover adds the matching wash + border; gold/teal tone for semantic actions.
- **Cards / nodes:** `rounded-lg` (8–10px); feature cards 14px; separation via **border + surface layer**, not shadow. Shadows are reserved for _floating_ things only (dialogs, popovers, tooltips, the Verse-of-the-Day card).
- **Inputs:** label/eyebrow above, error below; gold `:focus-visible` ring; no floating labels.
- **Tooltips:** styled (Radix) component, never the native `title`.
- **Loaders:** skeletal/quiet text matching layout dimensions — no circular spinners.
- **Empty states:** composed and instructive (e.g. the canvas empty state offers Verse of the Day + one-tap curated starting points), never bare "No data".
- **Sacred-content rule:** AI-written text (connection explanations, reflections) is **always visually distinct** from canonical verse text — teal-bordered editorial note, clearly labelled, never styled as scripture.

---

## 5. Layout Principles

- The **canvas stays flat** — an infinite navy field; nodes separated by border + surface, not elevation.
- Top chrome (headers) shares one shell: `#0a0f1a` background, `border-b` border, `px-6 md:px-12` edge padding, 60px height, the shared Wordmark at left.
- Content surfaces use max-width containers (e.g. ~1180px) centered with `px-6 md:px-12`.
- CSS Grid for structured layouts; no `calc()` percentage hacks.
- Full-height app shells use `h-dvh` (not `h-screen`) to avoid the iOS Safari jump.
- Strict single-column collapse below 768px; dense toolbars collapse to a hamburger + bottom action bar on mobile.

---

## 6. Motion & Interaction

- Easing token `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`. Durations: fast **120ms** (hover/state), base **200ms** (menus/dialogs), slow **360ms** (feature entrances).
- Animate **transform** and **opacity** only — never `top/left/width/height`.
- Soft, brief washes on hover; designed active and `:focus-visible` states on every interactive element (gold ring, 2px, offset 2px).
- Always honor `@media (prefers-reduced-motion: reduce)`.

---

## 7. Anti-Patterns (Banned)

- No `Inter`; no generic serifs (Amiri only).
- No pure black `#000000`.
- No purple/blue-neon aesthetic; no outer-glow or neon shadows.
- No oversaturated accents; no gradient text on large headings.
- **No hardcoded hex in a component — every color is a token.** A literal hex is a bug.
- Arabic never below 16px; AI text never styled as canonical scripture.
- No emojis; no AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen").
- No filler UI text ("Scroll to explore", bouncing chevrons); no custom mouse cursors.
- No generic placeholder names or fake round stats; no broken image links.
