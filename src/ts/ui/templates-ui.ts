// Shared helpers for showing templates: tiny code pictures and "poster" cards.

import { encodeText, type QrMatrix } from "../qr/encoder";
import { renderSvg } from "../qr/render";
import { scanCheck } from "../qr/scan";
import { stageColors, styleFromTemplate, TEMPLATES, type QrStyle, type StageColors, type Template } from "../qr/style";
import { esc } from "../lib/dom";
import { icon } from "./icon";

export const SAMPLE_TEXT = "https://example.com";

let sampleMatrix: QrMatrix | null = null;

/** The sample code used in previews (computed once). */
export function getSampleMatrix(): QrMatrix {
  if (!sampleMatrix) sampleMatrix = encodeText(SAMPLE_TEXT, "M");
  return sampleMatrix;
}

export function miniCodeSvg(style: QrStyle, idPrefix: string, title: string): string {
  return renderSvg(getSampleMatrix(), { ...style, margin: 2 }, null, { idPrefix, title });
}

/** CSS custom properties for a stage, as an inline style string. */
export function stageStyle(colors: StageColors): string {
  return `--stage-from:${colors.from};--stage-to:${colors.to};--stage-glow:${colors.glow};--stage-fg:${colors.fg};--stage-soft:${colors.soft}`;
}

export function applyStage(el: HTMLElement, colors: StageColors): void {
  el.style.setProperty("--stage-from", colors.from);
  el.style.setProperty("--stage-to", colors.to);
  el.style.setProperty("--stage-glow", colors.glow);
  el.style.setProperty("--stage-fg", colors.fg);
  el.style.setProperty("--stage-soft", colors.soft);
}

export function posterHtml(template: Template, index: number): string {
  const style = styleFromTemplate(template.id);
  const report = scanCheck(getSampleMatrix(), style, null);
  const colors = stageColors(template.stage);
  const svg = miniCodeSvg(style, `poster-${index}`, `Sample ${template.name} QR code`);
  const metaIcon = report.verdict === "good" ? "circleCheck" : "warning";
  return `<li>
    <a class="poster" href="create.html?template=${esc(template.id)}" aria-label="Use the ${esc(template.name)} template">
      <div class="poster-stage stage" style="${stageStyle(colors)}"><div class="plate">${svg}</div></div>
      <div class="poster-info">
        <h3>${esc(template.name)}</h3>
        <p>${esc(template.description)}</p>
        <span class="poster-meta">${icon(metaIcon)} ${esc(report.label)}, contrast ${report.contrastRatio.toFixed(1)} to 1</span>
      </div>
    </a>
  </li>`;
}

export function renderPosters(container: HTMLElement, limit?: number): void {
  const list = typeof limit === "number" ? TEMPLATES.slice(0, limit) : TEMPLATES;
  container.innerHTML = list.map((t, i) => posterHtml(t, i)).join("");
}
