/**
 * Centralized design tokens for TRAVEL GOGO.
 *
 * This file is the single source of truth for the app's visual language —
 * colors, radius, shadows, typography, spacing, and motion.
 * `tailwind.config.ts` imports these values directly, so a future UI change
 * (e.g. a new accent color, a softer shadow) should only require editing
 * this file — not hunting through components for hardcoded values.
 *
 * Light mode only. See docs/AI_RULES.md: "Do NOT add Dark Mode."
 *
 * These values are a 1:1 mirror of what `tailwind.config.ts` previously
 * defined inline — moving them here does not change any rendered color,
 * spacing, radius, or shadow.
 */

export const colors = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  ink: "#222222",
  muted: "#777777",
  accent: {
    coffee: "#7B664F",
    green: "#8FA68E",
    blue: "#8CA3B5",
  },
  // Neutral active/selected surface shared by controls and navigation.
  accentSoft: "#F6F6F6",
  tag: {
    drink: "#DCEBDD",
    "drink-fg": "#4C6B52",
    food: "#F3E3D3",
    "food-fg": "#8A5A34",
    beauty: "#F5DFE6",
    "beauty-fg": "#8A4A63",
    other: "#E7E4DE",
    "other-fg": "#6B655D",
    expiring: "#F0C9A0",
    "expiring-fg": "#7A4A1D",
  },
  border: "#E5E5E5",
  // Quiet supporting colors for badges, dividers, and input backgrounds.
  badgeBorder: "#E5E5E5",
  badgeText: "#777777",
  divider: "#EEEEEE",
  searchBackground: "#F6F6F6",
  travelType: {
    food: "#fff6b6",
    place: "#cfedf9",
    shop: "#ffe9ee",
  },
} as const;

export const borderRadius = {
  card: "6px",
  pill: "6px",
} as const;

export const layout = {
  // Phase 4C: fixed reward-card height, centralized instead of an inline
  // arbitrary value — every RewardCard references this one token.
  // Phase 4C v2: bumped up to fit the more generous internal spacing
  // (padding, divider/description/notes rhythm) added this pass.
  // Phase 4D: reduced again — the card's internal spacing was tightened to
  // remove empty vertical space on shorter cards; typography is unchanged.
  cardMinHeight: "260px",
} as const;

export const boxShadow = {
  soft: "0 1px 3px rgba(0,0,0,0.04)",
  pop: "0 8px 30px rgba(0,0,0,0.10)",
} as const;

export const typography = {
  fontFamily: {
    // Phase 5D: shared sans-serif stack for the entire app (frontend +
    // Admin), replacing the previous Inter/Noto Sans TC web-font pairing
    // and the separate serif wordmark stack below. System fonts only —
    // no next/font/google import — so there's no external font fetch and
    // no macOS/Windows rendering mismatch. `-apple-system`/`BlinkMacSystemFont`
    // cover macOS/iOS, `"Segoe UI"` covers Windows, and the CJK fallbacks
    // ("Noto Sans TC", "Microsoft JhengHei", "PingFang TC") keep Traditional
    // Chinese text on-system across platforms.
    sans: [
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
      "Noto Sans TC",
      "Microsoft JhengHei",
      "PingFang TC",
      "Helvetica Neue",
      "Arial",
      "sans-serif",
    ],
  },
  fontSize: {
    list: ["12px", { lineHeight: "1.6" }] as [string, { lineHeight: string }],
    title: ["20px", { lineHeight: "1.3", letterSpacing: "-0.01em" }] as [
      string,
      { lineHeight: string; letterSpacing: string },
    ],
    // Phase 4C v2: reward-card store name — 20px, 1.3 line-height,
    // 0.075em tracking (same tracking value as the app's general interface
    // text — see letterSpacing.body below).
    // Phase 5D: font family changed from serif to the shared sans stack;
    // size/line-height/tracking (the hierarchy) are unchanged.
    storeName: ["20px", { lineHeight: "1.3", letterSpacing: "0.075em" }] as [
      string,
      { lineHeight: string; letterSpacing: string },
    ],
  },
  letterSpacing: {
    // Wordmark spacing stays distinct from ordinary interface text.
    wordmark: "0.2em",
    // Phase 4D: a tighter tracking value used only below the `sm` breakpoint,
    // paired with a smaller font-size, so "BIRTHDAY REWARDS" always fits on
    // one line on narrow screens without truncating or wrapping.
    wordmarkCompact: "0.04em",
    // Compact interface rhythm shared across body copy and controls.
    body: "0.025em",
  },
} as const;

export const keyframes = {
  dialogOverlayIn: { from: { opacity: "0" }, to: { opacity: "1" } },
  dialogOverlayOut: { from: { opacity: "1" }, to: { opacity: "0" } },
  dialogContentIn: {
    from: { opacity: "0", scale: "0.97" },
    to: { opacity: "1", scale: "1" },
  },
  dialogContentOut: {
    from: { opacity: "1", scale: "1" },
    to: { opacity: "0", scale: "0.98" },
  },
} as const;

export const animation = {
  dialogOverlayIn: "dialogOverlayIn 200ms ease-out",
  dialogOverlayOut: "dialogOverlayOut 160ms ease-out",
  dialogContentIn: "dialogContentIn 220ms cubic-bezier(0.16, 1, 0.3, 1)",
  dialogContentOut: "dialogContentOut 160ms ease-out",
} as const;
