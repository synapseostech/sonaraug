import { test } from "node:test";
import assert from "node:assert/strict";
import { darkTheme, lightTheme, minTouchTarget, type ColorTokens } from "./design-tokens.ts";

/** WCAG 2.1/2.2 relative luminance for sRGB hex colours. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  assert.equal(value.length, 6, `expected 6-digit hex, got ${hex}`);
  const channels = [0, 2, 4].map((offset) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const TEXT_PAIRS: Array<[keyof ColorTokens, keyof ColorTokens]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surfaceRaised"],
  ["textMuted", "bg"],
  ["textMuted", "surface"],
  ["onAccent", "accent"],
  ["danger", "surface"],
  ["success", "surface"],
];

for (const [themeName, theme] of [["dark", darkTheme], ["light", lightTheme]] as const) {
  for (const [fg, bg] of TEXT_PAIRS) {
    test(`${themeName}: ${fg} on ${bg} meets WCAG AA 4.5:1`, () => {
      const ratio = contrastRatio(theme[fg], theme[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs >= 4.5:1`);
    });
  }
}

test("accent is distinguishable from body text in both themes", () => {
  for (const theme of [darkTheme, lightTheme]) {
    assert.notEqual(theme.accent.toLowerCase(), theme.text.toLowerCase());
  }
});

test("minimum touch target meets WCAG 2.2 AA (24px) and platform guidance (48dp)", () => {
  assert.ok(minTouchTarget >= 48);
});
