// Home page: the small generator in the hero, the code-type filter, template posters and the scan demo.

import { buildPayload, getType } from "../qr/payloads";
import { encodeText, QrTooLongError } from "../qr/encoder";
import { renderSvg } from "../qr/render";
import { scanCheck } from "../qr/scan";
import { DEFAULT_STYLE, getTemplate, stageFor, styleFromTemplate, type QrStyle } from "../qr/style";
import { downloadBlob, exportFileName, svgToPngBlob } from "../qr/export";
import { esc, qs, qsa, safeSessionSet } from "../lib/dom";
import { icon } from "./icon";
import { applyStage, renderPosters } from "./templates-ui";
import { toast } from "./toast";

const QUICK_TEMPLATES = ["saffron", "classic", "terai", "ocean", "berry", "midnight"];

function initHeroGenerator(): void {
  const root = qs<HTMLElement>("[data-hero-gen]");
  if (!root) return;
  const input = qs<HTMLInputElement>("#hero-url", root);
  const plate = qs<HTMLElement>(".plate", root);
  const swatchList = qs<HTMLElement>(".swatches", root);
  const message = qs<HTMLElement>("#hero-error", root);
  const downloadBtn = qs<HTMLButtonElement>("#hero-download", root);
  const studioLink = qs<HTMLAnchorElement>("#hero-studio", root);
  const stageEl = qs<HTMLElement>("[data-hero-stage]", root);
  if (!input || !plate || !swatchList || !message || !downloadBtn || !studioLink) return;

  let templateId = "saffron";
  let style: QrStyle = styleFromTemplate(templateId);
  let ready: { text: string; svg: string } | null = null;

  swatchList.innerHTML = QUICK_TEMPLATES.map((id, i) => {
    const t = getTemplate(id);
    if (!t) return "";
    const s = styleFromTemplate(id);
    const swatchColor = s.fillMode === "gradient" ? `linear-gradient(135deg, ${s.dotColor}, ${s.gradientTo})` : s.background && id === "midnight" ? s.background : s.dotColor;
    return `<li class="swatch"><input type="radio" name="hero-template" id="hero-t-${i}" value="${esc(id)}" ${id === templateId ? "checked" : ""} aria-label="${esc(t.name)} style"><span class="swatch-body" style="background:${swatchColor}"></span></li>`;
  }).join("");

  const update = () => {
    const raw = input.value;
    const result = buildPayload("url", { url: raw });
    const exampleResult = buildPayload("url", getType("url").example);
    const useText = result.ok ? result.text : exampleResult.ok ? exampleResult.text : "https://example.com";
    try {
      const matrix = encodeText(useText, style.ecc, { boostEcc: true });
      const svg = renderSvg(matrix, style, null, { idPrefix: "hero", title: result.ok ? result.summary : "Example QR code" });
      plate.innerHTML = svg;
      plate.classList.toggle("is-sample", !result.ok);
      ready = result.ok ? { text: useText, svg } : null;
    } catch (error) {
      if (!(error instanceof QrTooLongError)) throw error;
      ready = null;
    }
    const showError = !result.ok && raw.trim() !== "" && !result.empty;
    input.setAttribute("aria-invalid", String(showError));
    message.textContent = showError && !result.ok ? (result.errors.url ?? "") : "";
    message.classList.toggle("is-visible", showError);
  };

  input.addEventListener("input", update);
  swatchList.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name !== "hero-template") return;
    templateId = target.value;
    style = styleFromTemplate(templateId);
    if (stageEl) applyStage(stageEl, stageFor(style, templateId));
    update();
  });

  downloadBtn.addEventListener("click", async () => {
    if (!ready) {
      input.setAttribute("aria-invalid", "true");
      message.textContent = input.value.trim() === "" ? "Enter the web address you want to share." : message.textContent;
      message.classList.add("is-visible");
      input.focus();
      return;
    }
    downloadBtn.classList.add("is-working");
    try {
      const svg = renderSvg(encodeText(ready.text, style.ecc, { boostEcc: true }), style, null, { size: 1024, idPrefix: "dl", standalone: true });
      downloadBlob(await svgToPngBlob(svg, 1024), exportFileName("website", "png", 1024));
      toast("PNG downloaded. Open Create to customize it.");
    } catch {
      toast("The image could not be saved. Try again.", "error");
    } finally {
      downloadBtn.classList.remove("is-working");
    }
  });

  studioLink.addEventListener("click", () => {
    safeSessionSet("qrs.handoff", JSON.stringify({ type: "url", values: { url: input.value }, templateId }));
  });

  update();
}

function initTypeFilter(): void {
  const buttons = qsa<HTMLButtonElement>("[data-filter]");
  const items = qsa<HTMLElement>("[data-group]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const group = btn.dataset.filter ?? "all";
      items.forEach((item) => {
        item.hidden = !(group === "all" || item.dataset.group === group);
      });
    });
  });
}

function initScanDemo(): void {
  const targets = qsa<HTMLElement>("[data-scan-demo]");
  targets.forEach((el, i) => {
    const kind = el.dataset.scanDemo;
    const style: QrStyle =
      kind === "weak"
        ? { ...DEFAULT_STYLE, dotShape: "rounded", dotColor: "#cfc3b0", background: "#fffaf2" }
        : { ...DEFAULT_STYLE, dotColor: "#a8460a", background: "#fffaf2" };
    const matrix = encodeText("https://example.com/menu", "M");
    const report = scanCheck(matrix, style, null);
    const plate = qs<HTMLElement>(".plate", el);
    const label = qs<HTMLElement>(".demo-label", el);
    if (plate) plate.innerHTML = renderSvg(matrix, style, null, { idPrefix: `demo${i}`, title: kind === "weak" ? "Example of a weak code" : "Example of a strong code" });
    if (label) {
      label.dataset.verdict = report.verdict === "risky" ? "risky" : "good";
      label.innerHTML = `${icon(report.verdict === "risky" ? "circleAlert" : "circleCheck")} ${esc(report.label)} (contrast ${report.contrastRatio.toFixed(1)} to 1)`;
    }
  });
}

export function initHome(): void {
  initHeroGenerator();
  initTypeFilter();
  initScanDemo();
  const posters = qs<HTMLElement>("#home-posters");
  if (posters) renderPosters(posters, 6);
}
