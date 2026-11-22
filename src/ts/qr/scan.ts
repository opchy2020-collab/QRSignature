// The "scan check": plain-language advice on whether a design will scan reliably.
// It looks at contrast, light-on-dark colours, the empty border, logo size and how dense the code is.

import { contrast, luminance } from "../lib/color";
import type { QrMatrix } from "./encoder";
import { logoCoverage } from "./render";
import type { QrLogo, QrStyle } from "./style";

export type CheckStatus = "pass" | "warn" | "fail";

export interface ScanCheck {
  id: "contrast" | "colors" | "border" | "logo" | "density" | "background";
  status: CheckStatus;
  title: string;
  detail: string;
}

export type Verdict = "good" | "notes" | "risky";

export interface ScanReport {
  verdict: Verdict;
  label: string;
  /** 0 to 100. */
  score: number;
  checks: ScanCheck[];
  /** The lowest contrast ratio between any dark part of the code and the background. */
  contrastRatio: number;
  /** A suggested minimum printed width in centimetres. */
  minPrintCm: number;
}

const GOOD_CONTRAST = 4;
const MIN_CONTRAST = 2.5;

/** The colours the code is drawn with (the gradient ends and the corner colours). */
function inkColors(style: QrStyle): string[] {
  const colors = [style.dotColor];
  if (style.fillMode === "gradient") colors.push(style.gradientTo);
  if (style.frameColor) colors.push(style.frameColor);
  if (style.centerColor) colors.push(style.centerColor);
  return colors;
}

/** Lowest contrast between the code's colours and the background (white is assumed if transparent). */
export function lowestContrast(style: QrStyle): number {
  const bg = style.background ?? "#ffffff";
  return Math.min(...inkColors(style).map((c) => contrast(c, bg)));
}

export function isInverted(style: QrStyle): boolean {
  const bg = style.background ?? "#ffffff";
  return luminance(style.dotColor) > luminance(bg);
}

export function scanCheck(matrix: QrMatrix, style: QrStyle, logo: QrLogo | null): ScanReport {
  const checks: ScanCheck[] = [];
  const ratio = lowestContrast(style);
  const ratioText = ratio.toFixed(1);

  // 1. Contrast
  if (ratio >= GOOD_CONTRAST) {
    checks.push({ id: "contrast", status: "pass", title: "Strong contrast", detail: `The code stands out well from its background (${ratioText} to 1).` });
  } else if (ratio >= MIN_CONTRAST) {
    checks.push({ id: "contrast", status: "warn", title: "Contrast could be stronger", detail: `Contrast is ${ratioText} to 1. Aim for at least 4 to 1. Use a darker code or a lighter background.` });
  } else {
    checks.push({ id: "contrast", status: "fail", title: "Contrast is too low", detail: `Contrast is only ${ratioText} to 1. Many phones will not read this. Make the code much darker than the background.` });
  }

  // 2. Light code on dark background
  if (isInverted(style)) {
    checks.push({ id: "colors", status: "warn", title: "Light code on a dark background", detail: "Most new phones read this. Some older scanners cannot. Test it before you print." });
  } else {
    checks.push({ id: "colors", status: "pass", title: "Dark code on a light background", detail: "This works with every scanner." });
  }

  // 3. Empty border
  if (style.margin >= 4) {
    checks.push({ id: "border", status: "pass", title: "Empty border is wide enough", detail: `${style.margin} squares of space around the code. That is the standard.` });
  } else if (style.margin >= 2) {
    checks.push({ id: "border", status: "warn", title: "Empty border is narrow", detail: "Leave at least 4 squares of empty space, or make sure the code is printed on a plain area." });
  } else {
    checks.push({ id: "border", status: "fail", title: "Almost no empty border", detail: "Scanners need empty space around the code to find it. Raise the border to 4 or more, or print the code on a plain area." });
  }

  // 4. Logo
  if (logo) {
    const cover = logoCoverage(matrix.size, logo);
    const pct = Math.round(cover.widthShare * 100);
    if (cover.widthShare <= 0.22 && matrix.ecc === "H") {
      checks.push({ id: "logo", status: "pass", title: "Logo size is safe", detail: `The logo covers ${pct}% of the width. The code uses the highest error correction to make up for it.` });
    } else if (cover.widthShare <= 0.3 && matrix.ecc === "H") {
      checks.push({ id: "logo", status: "warn", title: "Logo is fairly large", detail: `The logo covers ${pct}% of the width. Test it on two or three phones, or make the logo smaller.` });
    } else {
      checks.push({ id: "logo", status: "fail", title: "Logo is too large", detail: `The logo covers ${pct}% of the width. Make it smaller so the code can still be read.` });
    }
  }

  // 5. Density
  const minPrintCm = Math.max(2, Math.ceil((matrix.size + 2 * Math.max(style.margin, 4)) * 0.06 * 10) / 10);
  if (matrix.version <= 10) {
    checks.push({ id: "density", status: "pass", title: "Simple code", detail: `Not much data, so it scans fast. Print it at least ${minPrintCm} cm wide.` });
  } else if (matrix.version <= 20) {
    checks.push({ id: "density", status: "warn", title: "Dense code", detail: `There is a lot of data. Print it at least ${minPrintCm} cm wide, or shorten the content.` });
  } else {
    checks.push({ id: "density", status: "warn", title: "Very dense code", detail: `This code holds a lot of data. Print it at least ${minPrintCm} cm wide, or shorten the content to make it easier to scan.` });
  }

  // 6. Transparent background
  if (style.background === null) {
    checks.push({ id: "background", status: "warn", title: "Transparent background", detail: "The code is only readable if you place it on a plain, light area. Check contrast where you use it." });
  }

  let score = 100;
  for (const c of checks) score -= c.status === "fail" ? 40 : c.status === "warn" ? 10 : 0;
  score = Math.max(0, score);
  const anyFail = checks.some((c) => c.status === "fail");
  const anyWarn = checks.some((c) => c.status === "warn");
  const verdict: Verdict = anyFail ? "risky" : anyWarn ? "notes" : "good";
  const label = verdict === "good" ? "Scans well" : verdict === "notes" ? "Scans, with notes" : "May not scan";

  return { verdict, label, score, checks, contrastRatio: ratio, minPrintCm };
}
