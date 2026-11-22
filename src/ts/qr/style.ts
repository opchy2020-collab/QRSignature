// How a QR code looks: dot shapes, colours, templates, and the colour "stage" behind a code.

import { contrast, mix, normalizeHex } from "../lib/color";
import type { Ecc } from "./encoder";

export type DotShape = "square" | "rounded" | "dots" | "small-dots" | "classy" | "diamond";
export type FrameShape = "square" | "rounded" | "circle";
export type CenterShape = "square" | "dot";
export type FillMode = "solid" | "gradient";

export const DOT_SHAPES: { id: DotShape; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "dots", label: "Dots" },
  { id: "small-dots", label: "Small dots" },
  { id: "classy", label: "Classy" },
  { id: "diamond", label: "Diamond" },
];

export const FRAME_SHAPES: { id: FrameShape; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "circle", label: "Circle" },
];

export const CENTER_SHAPES: { id: CenterShape; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "dot", label: "Dot" },
];

export const ECC_CHOICES: { id: Ecc; label: string; detail: string }[] = [
  { id: "L", label: "Low (7%)", detail: "Smallest code. Best for clean screens." },
  { id: "M", label: "Medium (15%)", detail: "Good for most uses." },
  { id: "Q", label: "High (25%)", detail: "Survives small scratches or smudges." },
  { id: "H", label: "Highest (30%)", detail: "Needed when a logo covers the middle." },
];

export interface QrStyle {
  dotShape: DotShape;
  frameShape: FrameShape;
  centerShape: CenterShape;
  fillMode: FillMode;
  /** The dot colour, or the first colour of the gradient. */
  dotColor: string;
  /** The second colour of the gradient (used when fillMode is "gradient"). */
  gradientTo: string;
  gradientAngle: number;
  /** null means "same as the dots". */
  frameColor: string | null;
  centerColor: string | null;
  /** null means transparent. */
  background: string | null;
  /** Empty border around the code, in modules (small squares). */
  margin: number;
  ecc: Ecc;
}

export interface QrLogo {
  /** A data: URL made from the uploaded picture. */
  href: string;
  shape: "square" | "round";
  /** Logo width as a share of the code width. */
  size: number;
}

export const LOGO_MIN = 0.12;
export const LOGO_MAX = 0.28;
export const LOGO_DEFAULT = 0.2;
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 8;

// ---- The stage -------------------------------------------------------------------------------

export interface Stage {
  from: string;
  to: string;
  glow: string;
  /** Deep stages use light text. */
  deep: boolean;
}

export interface StageColors {
  from: string;
  to: string;
  glow: string;
  /** Main text colour on the stage. */
  fg: string;
  /** Softer text colour on the stage. Still readable. */
  soft: string;
}

const INK = "#2c2416";
const WHITE = "#ffffff";
const MIN_TEXT_CONTRAST = 4.5;

function worst(color: string, stage: Stage): number {
  return Math.min(contrast(color, stage.from), contrast(color, stage.to));
}

/** Works out text colours that stay readable on the stage, whatever its colours are. */
export function stageColors(stage: Stage): StageColors {
  const preferred = stage.deep ? WHITE : INK;
  const other = stage.deep ? INK : WHITE;
  const fg = worst(preferred, stage) >= worst(other, stage) ? preferred : other;

  // The soft colour starts partway toward the stage and moves back until it is readable.
  const base = stage.deep ? mix(stage.from, stage.to, 0.5) : mix(stage.from, stage.to, 0.5);
  let soft = mix(fg, base, 0.28);
  for (let t = 0.28; t >= 0 && worst(soft, stage) < MIN_TEXT_CONTRAST; t -= 0.04) {
    soft = mix(fg, base, Math.max(0, t));
  }
  if (worst(soft, stage) < MIN_TEXT_CONTRAST) soft = fg;
  return { from: stage.from, to: stage.to, glow: stage.glow, fg, soft };
}

/** A pale stage tinted with the code's main colour. Used for custom colours. */
export function deriveStage(style: QrStyle): Stage {
  const base = normalizeHex(style.dotColor, "#b24a08");
  return {
    from: mix(base, WHITE, 0.9),
    to: mix(base, WHITE, 0.78),
    glow: mix(base, WHITE, 0.55),
    deep: false,
  };
}

// ---- Templates -------------------------------------------------------------------------------

export interface Template {
  id: string;
  name: string;
  description: string;
  style: Partial<QrStyle>;
  stage: Stage;
}

export const DEFAULT_STYLE: QrStyle = {
  dotShape: "rounded",
  frameShape: "rounded",
  centerShape: "dot",
  fillMode: "solid",
  dotColor: "#a8460a",
  gradientTo: "#6b2a04",
  gradientAngle: 135,
  frameColor: null,
  centerColor: null,
  background: "#fffaf2",
  margin: 4,
  ecc: "M",
};

export const TEMPLATES: Template[] = [
  {
    id: "saffron",
    name: "Saffron",
    description: "Warm orange on cream. Our signature look.",
    style: { dotShape: "rounded", frameShape: "rounded", centerShape: "dot", dotColor: "#a8460a", background: "#fffaf2" },
    stage: { from: "#ffe9cc", to: "#ffc78a", glow: "#ffb25c", deep: false },
  },
  {
    id: "classic",
    name: "Classic ink",
    description: "Black and white. The most reliable choice.",
    style: { dotShape: "square", frameShape: "square", centerShape: "square", dotColor: "#2c2416", background: "#ffffff" },
    stage: { from: "#fff6e8", to: "#f6dfc0", glow: "#eec890", deep: false },
  },
  {
    id: "terai",
    name: "Terai green",
    description: "Deep forest green with round dots.",
    style: { dotShape: "dots", frameShape: "rounded", centerShape: "dot", dotColor: "#1f5f3a", background: "#f6fbf4" },
    stage: { from: "#17402a", to: "#0d2a1b", glow: "#3f9d66", deep: true },
  },
  {
    id: "clay",
    name: "Clay",
    description: "Earthy brown with classy dots.",
    style: { dotShape: "classy", frameShape: "rounded", centerShape: "square", dotColor: "#6b3410", background: "#fff4e6" },
    stage: { from: "#4a2a14", to: "#2c1809", glow: "#c8782e", deep: true },
  },
  {
    id: "marigold",
    name: "Marigold",
    description: "A gradient from orange to deep rust.",
    style: { dotShape: "rounded", frameShape: "rounded", centerShape: "dot", fillMode: "gradient", dotColor: "#b24a08", gradientTo: "#7a2503", gradientAngle: 135, background: "#fffdf7" },
    stage: { from: "#fff1c2", to: "#ffd778", glow: "#ffbb33", deep: false },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Light dots on a dark background.",
    style: { dotShape: "rounded", frameShape: "rounded", centerShape: "dot", dotColor: "#ffd9a0", frameColor: "#ffb35c", centerColor: "#ffb35c", background: "#1c1710" },
    stage: { from: "#2b2318", to: "#120e08", glow: "#7a5a2a", deep: true },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool blue with circle corners.",
    style: { dotShape: "rounded", frameShape: "circle", centerShape: "dot", dotColor: "#0b4f6c", background: "#f3fbff" },
    stage: { from: "#d6effa", to: "#a9dcf2", glow: "#6cc3e8", deep: false },
  },
  {
    id: "berry",
    name: "Berry",
    description: "Wine red gradient with classy dots.",
    style: { dotShape: "classy", frameShape: "rounded", centerShape: "dot", fillMode: "gradient", dotColor: "#8a1f4b", gradientTo: "#4a0f2e", gradientAngle: 90, background: "#fff6fa" },
    stage: { from: "#5a1236", to: "#2e0a1c", glow: "#d23c85", deep: true },
  },
  {
    id: "citrus",
    name: "Citrus",
    description: "Fresh lime green with small dots.",
    style: { dotShape: "small-dots", frameShape: "rounded", centerShape: "dot", dotColor: "#3f5a00", background: "#fcffec" },
    stage: { from: "#eef8bd", to: "#d4ec6e", glow: "#b6d936", deep: false },
  },
  {
    id: "slate",
    name: "Slate",
    description: "Calm blue-grey with square dots.",
    style: { dotShape: "square", frameShape: "rounded", centerShape: "square", dotColor: "#2f3b4a", background: "#f4f6f9" },
    stage: { from: "#e3e8ef", to: "#c7d0dc", glow: "#9aa9bd", deep: false },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Orange to purple gradient.",
    style: { dotShape: "rounded", frameShape: "rounded", centerShape: "dot", fillMode: "gradient", dotColor: "#c24a00", gradientTo: "#6a1b8a", gradientAngle: 45, background: "#fffaf6" },
    stage: { from: "#ffe2cf", to: "#e9d4f5", glow: "#f2a97e", deep: false },
  },
  {
    id: "paper",
    name: "Paper",
    description: "Soft brown diamonds on paper.",
    style: { dotShape: "diamond", frameShape: "square", centerShape: "square", dotColor: "#5c3a1e", background: "#fff9f0" },
    stage: { from: "#f9efe0", to: "#ecd9bd", glow: "#d9b988", deep: false },
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** A complete style for a template (everything not set by the template uses the defaults). */
export function styleFromTemplate(id: string, keep?: Pick<QrStyle, "margin" | "ecc">): QrStyle {
  const tpl = getTemplate(id) ?? (TEMPLATES[0] as Template);
  return {
    ...DEFAULT_STYLE,
    frameColor: null,
    centerColor: null,
    fillMode: "solid",
    ...tpl.style,
    ...(keep ?? {}),
  };
}

/** The stage behind a style: the template's hand-tuned stage, or one worked out from the colours. */
export function stageFor(style: QrStyle, templateId: string | null): StageColors {
  const tpl = templateId ? getTemplate(templateId) : undefined;
  return stageColors(tpl ? tpl.stage : deriveStage(style));
}

/** The error-correction level that will really be used (a logo needs the highest). */
export function effectiveEcc(style: QrStyle, logo: QrLogo | null): Ecc {
  return logo ? "H" : style.ecc;
}

export function clampMargin(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STYLE.margin;
  return Math.max(MARGIN_MIN, Math.min(MARGIN_MAX, Math.round(value)));
}

export function clampLogoSize(value: number): number {
  if (!Number.isFinite(value)) return LOGO_DEFAULT;
  return Math.max(LOGO_MIN, Math.min(LOGO_MAX, value));
}
