// Small colour helpers. Everything is plain "#rrggbb" text so it is easy to store and test.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Reads "#abc" or "#aabbcc" (the # is optional). Returns null if it is not a colour. */
export function parseHex(input: string): RGB | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  let digits = match[1] as string;
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function isHexColor(input: string): boolean {
  return parseHex(input) !== null;
}

export function toHex(c: RGB): string {
  const part = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
}

/** Always returns a valid "#rrggbb"; falls back when the input is not a colour. */
export function normalizeHex(input: string, fallback = "#000000"): string {
  const rgb = parseHex(input);
  return rgb ? toHex(rgb) : fallback;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string): number {
  const rgb = parseHex(color) ?? { r: 0, g: 0, b: 0 };
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio, from 1 (same colour) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes two colours. t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a) ?? { r: 0, g: 0, b: 0 };
  const cb = parseHex(b) ?? { r: 0, g: 0, b: 0 };
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}
