import type { Config } from "tailwindcss";
import { colors, borderRadius, boxShadow, typography, keyframes, animation, layout } from "./lib/theme";

// This file wires the centralized design tokens in lib/theme.ts into
// Tailwind. To change a color, radius, shadow, font, or animation across
// the whole app, edit lib/theme.ts — not this file.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        surface: colors.surface,
        ink: colors.ink,
        muted: colors.muted,
        accent: colors.accent,
        accentSoft: colors.accentSoft,
        tag: colors.tag,
        border: colors.border,
        badgeBorder: colors.badgeBorder,
        badgeText: colors.badgeText,
        divider: colors.divider,
        searchBackground: colors.searchBackground,
      },
      fontFamily: {
        sans: [...typography.fontFamily.sans],
      },
      fontSize: typography.fontSize,
      letterSpacing: typography.letterSpacing,
      minHeight: {
        card: layout.cardMinHeight,
      },
      spacing: {
        // 8px grid helpers beyond Tailwind defaults are already covered by default scale
      },
      borderRadius,
      boxShadow,
      keyframes,
      animation,
    },
  },
  plugins: [],
};

export default config;
