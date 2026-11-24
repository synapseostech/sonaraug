/**
 * Design tokens shared by web and mobile. Values only — no components here.
 * Contrast ratios are asserted in design-tokens.test.ts against WCAG 2.2 AA.
 */

export type Theme = "dark" | "light";

export type ColorTokens = {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly danger: string;
  readonly success: string;
};

/** Dark charcoal is the primary interface (per product brief §8). */
export const darkTheme: ColorTokens = {
  bg: "#121212",
  surface: "#1C1C1E",
  surfaceRaised: "#262629",
  text: "#F7F5F2",
  textMuted: "#A8A5A0",
  border: "#333336",
  accent: "#F5A524",
  onAccent: "#1A1206",
  danger: "#FF6B6B",
  success: "#4ADE80",
};

/** Warm white light theme. */
export const lightTheme: ColorTokens = {
  bg: "#FAF7F2",
  surface: "#FFFFFF",
  surfaceRaised: "#F2EEE7",
  text: "#1A1815",
  textMuted: "#5C5852",
  border: "#E2DCD3",
  accent: "#8A5200",
  onAccent: "#FFFFFF",
  danger: "#B3261E",
  success: "#1B7F4B",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/** Minimum interactive target (WCAG 2.2 AA / platform guidance). */
export const minTouchTarget = 48;

export const typeScale = {
  display: { size: 32, lineHeight: 38, weight: 700 },
  title: { size: 24, lineHeight: 30, weight: 700 },
  heading: { size: 19, lineHeight: 26, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  bodySmall: { size: 14, lineHeight: 20, weight: 400 },
  caption: { size: 12, lineHeight: 16, weight: 500 },
} as const;
