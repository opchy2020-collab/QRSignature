// Prepares an uploaded logo or profile picture. It stays in the browser: nothing is uploaded.
// The picture is redrawn on a canvas, which removes any hidden data (location, camera info) in the file.

export const MAX_LOGO_BYTES = 3 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const OUTPUT = 512;

export interface LogoAssets {
  /** The whole picture, fitted inside a square (for square logos). */
  contain: string;
  /** The picture cropped to a square from the middle (for round profile pictures). */
  cover: string;
  name: string;
}

export type LogoResult = { ok: true; assets: LogoAssets } | { ok: false; error: string };

export function checkLogoFile(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(file.type)) {
    return "That file type is not supported. Use a PNG, JPG, WebP, GIF or SVG picture.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "That picture is larger than 3 MB. Choose a smaller one.";
  }
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

function draw(img: HTMLImageElement, mode: "contain" | "cover"): string {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const w = img.naturalWidth || OUTPUT;
  const h = img.naturalHeight || OUTPUT;
  const scale = mode === "contain" ? Math.min(OUTPUT / w, OUTPUT / h) : Math.max(OUTPUT / w, OUTPUT / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (OUTPUT - dw) / 2, (OUTPUT - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
}

export async function prepareLogo(file: File): Promise<LogoResult> {
  const problem = checkLogoFile(file);
  if (problem) return { ok: false, error: problem };
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { ok: true, assets: { contain: draw(img, "contain"), cover: draw(img, "cover"), name: file.name } };
  } catch {
    return { ok: false, error: "We could not read that picture. Try a different file." };
  } finally {
    URL.revokeObjectURL(url);
  }
}
