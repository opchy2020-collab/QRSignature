// Saving, copying and sharing the finished code. This file touches the browser (canvas, clipboard, share sheet).

/** A file-name-safe name such as "qr-signature-website-1024.png". */
export function exportFileName(label: string, extension: "png" | "svg", size?: number): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "code";
  return `qr-signature-${safe}${size ? `-${size}` : ""}.${extension}`;
}

/** Turns SVG text into a PNG picture of the given size. */
export async function svgToPngBlob(svg: string, pixels: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.width = pixels;
    img.height = pixels;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The picture could not be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser cannot make images.");
    ctx.drawImage(img, 0, 0, pixels, pixels);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be saved."))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadSvg(svg: string, filename: string): void {
  const prefix = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  downloadBlob(new Blob([prefix + svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

export type CopyResult = "copied" | "unsupported";

export async function copyImage(blob: Blob): Promise<CopyResult> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined" || !window.isSecureContext) {
    return "unsupported";
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return "copied";
}

export async function copyText(text: string): Promise<CopyResult> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  // Older fallback for pages opened as a file on a computer.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok ? "copied" : "unsupported";
}

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === "function" && typeof navigator.share === "function" && navigator.canShare({ files: [file] });
}

export type ShareResult = "shared" | "cancelled";

export async function shareFile(file: File, title: string, text: string): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], title, text });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}
