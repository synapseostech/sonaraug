import type { ColorTokens } from "@kito/config";

/**
 * Serialises a colour theme into CSS custom properties.
 *
 * The design tokens in `@kito/config` stay the single source of truth: the web
 * app injects this string once in its root layout, so a token change propagates
 * without editing any stylesheet. Component CSS only ever reads `--kt-*`.
 */
export function cssVariables(theme: ColorTokens): string {
  const entries: Array<[string, string]> = [
    ["bg", theme.bg],
    ["surface", theme.surface],
    ["raised", theme.surfaceRaised],
    ["text", theme.text],
    ["muted", theme.textMuted],
    ["border", theme.border],
    ["accent", theme.accent],
    ["on-accent", theme.onAccent],
    ["danger", theme.danger],
    ["success", theme.success],
  ];
  return entries.map(([name, value]) => `--kt-${name}:${value};`).join("");
}

/**
 * Deterministic artwork colour pair derived from a stable id. Demo catalogue
 * artwork is generated rather than downloaded, so no copyrighted imagery is
 * bundled and every item keeps the same colours between renders and reloads.
 */
export function gradientFor(seed: string): { from: string; to: string } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  const hue = hash;
  const partner = (hue + 38) % 360;
  return {
    from: `hsl(${hue} 46% 28%)`,
    to: `hsl(${partner} 54% 16%)`,
  };
}

/** Initials used as artwork fallback text (max two characters). */
export function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
