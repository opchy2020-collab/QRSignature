// Draws a QR grid as an SVG picture, using the chosen style.
// The same SVG is used for the live preview, the SVG download and (via a canvas) the PNG download,
// so what you see is exactly what you get.

import { normalizeHex } from "../lib/color";
import { isFinderModule, type QrMatrix } from "./encoder";
import type { DotShape, FrameShape, CenterShape, QrLogo, QrStyle } from "./style";

export interface RenderOptions {
  /** Width and height in pixels. Leave out to let the container decide the size. */
  size?: number;
  /** Prefix for ids inside the SVG so several codes on one page do not clash. */
  idPrefix?: string;
  /** A short description, used as the picture's title and for screen readers. */
  title?: string;
  /** Add the namespace lines needed for a stand-alone .svg file. */
  standalone?: boolean;
}

const SAFE_IMAGE_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---- The logo --------------------------------------------------------------------------------

export interface LogoCoverage {
  /** Width of the cleared square, in modules (always odd so it sits exactly in the middle). */
  cells: number;
  /** Cleared width as a share of the code width, 0 to 1. */
  widthShare: number;
  /** Cleared area as a share of the whole code, 0 to 1. */
  areaShare: number;
}

export function logoCoverage(size: number, logo: Pick<QrLogo, "size"> | null): LogoCoverage {
  if (!logo) return { cells: 0, widthShare: 0, areaShare: 0 };
  let cells = Math.floor(size * logo.size);
  if (cells % 2 === 0) cells++;
  cells = Math.max(3, Math.min(cells, size - 14));
  const widthShare = cells / size;
  return { cells, widthShare, areaShare: widthShare * widthShare };
}

// ---- Shapes (all measured in modules) --------------------------------------------------------

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const a = `a${num(r)} ${num(r)} 0 0 1`;
  return (
    `M${num(x + r)} ${num(y)}h${num(w - 2 * r)}${a} ${num(r)} ${num(r)}` +
    `v${num(h - 2 * r)}${a} ${num(-r)} ${num(r)}` +
    `h${num(-(w - 2 * r))}${a} ${num(-r)} ${num(-r)}` +
    `v${num(-(h - 2 * r))}${a} ${num(r)} ${num(-r)}z`
  );
}

function circle(cx: number, cy: number, r: number): string {
  return `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0z`;
}

export function dotPath(shape: Exclude<DotShape, "square">, x: number, y: number): string {
  switch (shape) {
    case "rounded":
      return roundRect(x, y, 1, 1, 0.3);
    case "dots":
      return circle(x + 0.5, y + 0.5, 0.5);
    case "small-dots":
      return circle(x + 0.5, y + 0.5, 0.37);
    case "diamond":
      return `M${num(x + 0.5)} ${num(y - 0.12)}l0.62 0.62l-0.62 0.62l-0.62 -0.62z`;
    case "classy":
      // Two opposite corners are rounded, the other two stay sharp.
      return `M${num(x)} ${num(y + 0.5)}a0.5 0.5 0 0 1 0.5 -0.5h0.5v0.5a0.5 0.5 0 0 1 -0.5 0.5h-0.5z`;
  }
}

export function framePath(shape: FrameShape, x: number, y: number): string {
  switch (shape) {
    case "square":
      return `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}h5v5h-5z`;
    case "rounded":
      return roundRect(x, y, 7, 7, 2) + roundRect(x + 1, y + 1, 5, 5, 1.1);
    case "circle":
      return circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5);
  }
}

export function centerPath(shape: CenterShape, x: number, y: number): string {
  return shape === "dot"
    ? circle(x + 3.5, y + 3.5, 1.5)
    : `M${x + 2} ${y + 2}h3v3h-3z`;
}

// ---- The picture -----------------------------------------------------------------------------

export function renderSvg(
  matrix: QrMatrix,
  style: QrStyle,
  logo: QrLogo | null = null,
  options: RenderOptions = {},
): string {
  const n = matrix.size;
  const m = Math.max(0, Math.round(style.margin));
  const total = n + 2 * m;
  const prefix = options.idPrefix ?? "qr";

  const dotColor = normalizeHex(style.dotColor, "#000000");
  const gradientTo = normalizeHex(style.gradientTo, dotColor);
  const background = style.background ? normalizeHex(style.background, "#ffffff") : null;
  const dotFill = style.fillMode === "gradient" ? `url(#${prefix}-g)` : dotColor;
  const frameFill = style.frameColor ? normalizeHex(style.frameColor, dotColor) : dotFill;
  const centerFill = style.centerColor ? normalizeHex(style.centerColor, dotColor) : dotFill;

  const safeLogo = logo && SAFE_IMAGE_URL.test(logo.href) ? logo : null;
  const coverage = logoCoverage(n, safeLogo);
  const mid = (n - 1) / 2;
  const half = (coverage.cells - 1) / 2;
  const cleared = (x: number, y: number) =>
    safeLogo !== null && Math.abs(x - mid) <= half && Math.abs(y - mid) <= half;

  // Dots (everything except the three big corner squares and the cleared logo area).
  let dots = "";
  for (let y = 0; y < n; y++) {
    const row = matrix.modules[y] as boolean[];
    if (style.dotShape === "square") {
      let x = 0;
      while (x < n) {
        if (row[x] && !isFinderModule(n, x, y) && !cleared(x, y)) {
          let end = x;
          while (end + 1 < n && row[end + 1] && !isFinderModule(n, end + 1, y) && !cleared(end + 1, y)) end++;
          const len = end - x + 1;
          // A hair of overlap keeps neighbouring rows from showing a faint seam.
          dots += `M${m + x} ${m + y}h${num(len + 0.02)}v1.02h${num(-(len + 0.02))}z`;
          x = end + 1;
        } else {
          x++;
        }
      }
    } else {
      for (let x = 0; x < n; x++) {
        if (row[x] && !isFinderModule(n, x, y) && !cleared(x, y)) {
          dots += dotPath(style.dotShape, m + x, m + y);
        }
      }
    }
  }

  // The three corner squares.
  const corners: [number, number][] = [
    [m, m],
    [m + n - 7, m],
    [m, m + n - 7],
  ];
  const frames = corners.map(([x, y]) => framePath(style.frameShape, x, y)).join("");
  const centers = corners.map(([x, y]) => centerPath(style.centerShape, x, y)).join("");

  // Gradient across the whole picture.
  let defs = "";
  if (style.fillMode === "gradient") {
    const angle = (style.gradientAngle * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const reach = ((Math.abs(dx) + Math.abs(dy)) * total) / 2;
    const c = total / 2;
    defs +=
      `<linearGradient id="${prefix}-g" gradientUnits="userSpaceOnUse" ` +
      `x1="${num(c - dx * reach)}" y1="${num(c - dy * reach)}" x2="${num(c + dx * reach)}" y2="${num(c + dy * reach)}">` +
      `<stop offset="0" stop-color="${dotColor}"/><stop offset="1" stop-color="${gradientTo}"/></linearGradient>`;
  }

  // The logo, with a clean patch behind it.
  let logoMarkup = "";
  if (safeLogo) {
    const cx = m + n / 2;
    const side = coverage.cells - 0.6;
    const left = cx - side / 2;
    const patch = background ?? "#ffffff";
    if (safeLogo.shape === "round") {
      defs += `<clipPath id="${prefix}-c"><circle cx="${num(cx)}" cy="${num(cx)}" r="${num(side / 2)}"/></clipPath>`;
      logoMarkup =
        `<circle cx="${num(cx)}" cy="${num(cx)}" r="${num(side / 2 + 0.25)}" fill="${patch}"/>` +
        `<image href="${safeLogo.href}" xlink:href="${safeLogo.href}" x="${num(left)}" y="${num(left)}" width="${num(side)}" height="${num(side)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${prefix}-c)"/>`;
    } else {
      logoMarkup =
        `<rect x="${num(left - 0.2)}" y="${num(left - 0.2)}" width="${num(side + 0.4)}" height="${num(side + 0.4)}" rx="0.4" fill="${patch}"/>` +
        `<image href="${safeLogo.href}" xlink:href="${safeLogo.href}" x="${num(left)}" y="${num(left)}" width="${num(side)}" height="${num(side)}" preserveAspectRatio="xMidYMid meet"/>`;
    }
  }

  const title = options.title ? escapeXml(options.title) : "QR code";
  const sizeAttrs = options.size ? ` width="${options.size}" height="${options.size}"` : "";
  const namespaces =
    ` xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`;

  return (
    `<svg${namespaces} viewBox="0 0 ${total} ${total}"${sizeAttrs} role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    (defs ? `<defs>${defs}</defs>` : "") +
    (background ? `<rect width="${total}" height="${total}" fill="${background}"/>` : "") +
    (dots ? `<path d="${dots}" fill="${dotFill}"/>` : "") +
    `<path d="${frames}" fill="${frameFill}" fill-rule="evenodd"/>` +
    `<path d="${centers}" fill="${centerFill}"/>` +
    logoMarkup +
    `</svg>`
  );
}

/** Size in modules of the full picture (code plus empty border). */
export function totalModules(matrix: QrMatrix, style: QrStyle): number {
  return matrix.size + 2 * Math.max(0, Math.round(style.margin));
}
