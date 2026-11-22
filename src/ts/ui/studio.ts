// The Create page: pick what the code is for, type the details, design it, check it, download and share it.
//
// How this file is organised:
//   1. State (what the visitor has chosen so far)
//   2. Building the HTML for the form, the design panels and the preview
//   3. Updating the preview whenever something changes
//   4. Handling clicks and typing
//   5. Downloads and sharing

import { buildPayload, defaultValues, fileLabel, getType, isQrType, TYPES, type BuildResult, type FieldDef, type QrType, type Values } from "../qr/payloads";
import { encodeText, QrTooLongError, type QrMatrix } from "../qr/encoder";
import { dotPath, centerPath, framePath, renderSvg } from "../qr/render";
import { scanCheck, type ScanReport } from "../qr/scan";
import {
  CENTER_SHAPES, clampLogoSize, clampMargin, DOT_SHAPES, ECC_CHOICES, effectiveEcc, FRAME_SHAPES,
  getTemplate, LOGO_DEFAULT, LOGO_MAX, LOGO_MIN, MARGIN_MAX, MARGIN_MIN, stageColors, stageFor, styleFromTemplate, TEMPLATES,
  type CenterShape, type DotShape, type FrameShape, type QrLogo, type QrStyle,
} from "../qr/style";
import { canShareFile, copyImage, copyText, downloadBlob, downloadSvg, exportFileName, shareFile, svgToPngBlob } from "../qr/export";
import { buildShareLinks, siteUrl } from "../lib/share";
import { isHexColor, normalizeHex } from "../lib/color";
import { prepareLogo, type LogoAssets } from "../lib/logo";
import { esc, frameThrottle, must, qs, qsa, safeSessionGet, safeSessionRemove } from "../lib/dom";
import { icon, type IconId } from "./icon";
import { applyStage, miniCodeSvg, stageStyle } from "./templates-ui";
import { toast } from "./toast";

// ---- 1. State --------------------------------------------------------------------------------

type TabId = "templates" | "shapes" | "colors" | "logo" | "options";

interface LogoState {
  assets: LogoAssets;
  shape: "square" | "round";
  size: number;
}

interface State {
  type: QrType;
  values: Partial<Record<QrType, Values>>;
  touched: Set<string>;
  showAll: boolean;
  templateId: string | null;
  style: QrStyle;
  logo: LogoState | null;
  pngSize: number;
  tab: TabId;
}

interface Built {
  result: BuildResult;
  matrix: QrMatrix | null;
  tooLong: boolean;
  report: ScanReport | null;
  /** True when there is a real, valid code that can be downloaded. */
  ready: boolean;
}

const TABS: { id: TabId; label: string; icon: IconId }[] = [
  { id: "templates", label: "Templates", icon: "palette" },
  { id: "shapes", label: "Shapes", icon: "shapes" },
  { id: "colors", label: "Colors", icon: "wand" },
  { id: "logo", label: "Logo", icon: "image" },
  { id: "options", label: "Options", icon: "sliders" },
];

const PNG_SIZES = [512, 1024, 2048];

// ---- 2. HTML builders ------------------------------------------------------------------------

function typeTilesHtml(selected: QrType): string {
  return TYPES.map(
    (t) => `<label class="tile">
      <input type="radio" name="qr-type" value="${t.id}" ${t.id === selected ? "checked" : ""}>
      <span class="tile-body">${icon(t.icon)}<span>${esc(t.label)}</span></span>
    </label>`,
  ).join("");
}

function fieldHtml(def: FieldDef, value: string): string {
  const id = `f-${def.id}`;
  const hintId = def.hint ? `${id}-hint` : "";
  const describedBy = [hintId, `${id}-err`].filter(Boolean).join(" ");
  const attrs = `id="${id}" data-field="${def.id}" aria-describedby="${describedBy}"${def.required ? " required" : ""}${def.maxLength ? ` maxlength="${def.maxLength}"` : ""}`;
  const auto = def.autocomplete ? ` autocomplete="${def.autocomplete}"` : "";
  const req = def.required ? ` <span class="req">(required)</span>` : "";
  const hint = def.hint ? `<p class="hint" id="${hintId}">${esc(def.hint)}</p>` : "";
  const err = `<p class="error" id="${id}-err">${icon("circleAlert")}<span></span></p>`;

  if (def.kind === "checkbox") {
    return `<div class="field" data-field-wrap="${def.id}"><label class="check"><input type="checkbox" ${attrs} ${value === "true" ? "checked" : ""}> ${esc(def.label)}</label>${hint}</div>`;
  }
  let control: string;
  switch (def.kind) {
    case "textarea":
      control = `<textarea class="textarea" ${attrs}${auto} placeholder="${esc(def.placeholder ?? "")}">${esc(value)}</textarea>`;
      break;
    case "select":
      control = `<select class="select" ${attrs}>${(def.options ?? []).map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
      break;
    case "password":
      control = `<div class="input-wrap"><input class="input" type="password" ${attrs}${auto} spellcheck="false" autocapitalize="off" value="${esc(value)}"><button type="button" data-action="reveal" aria-controls="${id}" aria-pressed="false">Show</button></div>`;
      break;
    case "url":
      control = `<input class="input" type="text" inputmode="url" ${attrs}${auto} spellcheck="false" autocapitalize="off" placeholder="${esc(def.placeholder ?? "")}" value="${esc(value)}">`;
      break;
    case "email":
      control = `<input class="input" type="text" inputmode="email" ${attrs}${auto} spellcheck="false" autocapitalize="off" placeholder="${esc(def.placeholder ?? "")}" value="${esc(value)}">`;
      break;
    case "tel":
      control = `<input class="input" type="tel" ${attrs}${auto} placeholder="${esc(def.placeholder ?? "")}" value="${esc(value)}">`;
      break;
    default:
      control = `<input class="input" type="text" ${attrs}${auto} placeholder="${esc(def.placeholder ?? "")}" value="${esc(value)}">`;
  }
  return `<div class="field" data-field-wrap="${def.id}"><label for="${id}">${esc(def.label)}${req}</label>${control}${hint}${err}</div>`;
}

function glyph(inner: string, viewBox: string): string {
  return `<svg viewBox="${viewBox}" fill="currentColor" aria-hidden="true" focusable="false">${inner}</svg>`;
}

function dotGlyph(shape: DotShape): string {
  const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [1, 2], [2, 2]];
  const path = cells
    .map(([x, y]) => (shape === "square" ? `M${x + 0.5} ${y + 0.5}h1v1h-1z` : dotPath(shape, x + 0.5, y + 0.5)))
    .join("");
  return glyph(`<path d="${path}"/>`, "0 0 4 4");
}

function frameGlyph(shape: FrameShape): string {
  return glyph(`<path fill-rule="evenodd" d="${framePath(shape, 1, 1)}"/><path d="${centerPath("square", 1, 1)}"/>`, "0 0 9 9");
}

function centerGlyph(shape: CenterShape): string {
  return glyph(`<path fill-rule="evenodd" d="${framePath("square", 1, 1)}"/><path d="${centerPath(shape, 1, 1)}"/>`, "0 0 9 9");
}

function shapeRadios(name: string, items: { id: string; label: string }[], glyphFor: (id: string) => string): string {
  return `<div class="shape-grid">${items
    .map(
      (it) => `<label class="shape-pick"><input type="radio" name="${name}" value="${it.id}"><span class="shape-pick-body">${glyphFor(it.id)}<span>${esc(it.label)}</span></span></label>`,
    )
    .join("")}</div>`;
}

function colorRow(id: string, label: string): string {
  return `<div class="color-row" data-color-row="${id}">
    <span class="color-label" id="cl-${id}">${esc(label)}</span>
    <input type="color" data-color="${id}" aria-labelledby="cl-${id}">
    <input class="input" type="text" data-hex="${id}" aria-label="${esc(label)}, as a hex code" maxlength="7" spellcheck="false" autocomplete="off" autocapitalize="off">
  </div>`;
}

function designHtml(): string {
  const tablist = TABS.map(
    (t, i) => `<button class="tab" type="button" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${t.id}">${icon(t.icon)}<span>${esc(t.label)}</span></button>`,
  ).join("");

  const templatePanel = `<div class="template-grid">${TEMPLATES.map((t, i) => {
    const style = styleFromTemplate(t.id);
    const colors = stageColors(t.stage);
    return `<label class="template-pick"><input type="radio" name="template" value="${t.id}"><span class="template-pick-body stage" style="${stageStyle(colors)}"><span class="mini">${miniCodeSvg(style, `tp${i}`, `${t.name} template preview`)}</span>${esc(t.name)}</span></label>`;
  }).join("")}</div><p class="hint" id="template-note"></p>`;

  const shapesPanel = `
    <h3 class="subhead">Dot pattern</h3>${shapeRadios("dotShape", DOT_SHAPES, (id) => dotGlyph(id as DotShape))}
    <h3 class="subhead">Corner frame</h3>${shapeRadios("frameShape", FRAME_SHAPES, (id) => frameGlyph(id as FrameShape))}
    <h3 class="subhead">Corner center</h3>${shapeRadios("centerShape", CENTER_SHAPES, (id) => centerGlyph(id as CenterShape))}`;

  const colorsPanel = `
    <div class="field"><span class="label" id="fill-label">Dot color</span>
      <div class="segmented" role="radiogroup" aria-labelledby="fill-label">
        <label><input type="radio" name="fillMode" value="solid"><span>One color</span></label>
        <label><input type="radio" name="fillMode" value="gradient"><span>Gradient</span></label>
      </div></div>
    ${colorRow("dotColor", "Dots")}
    <div data-show="gradient">
      ${colorRow("gradientTo", "Gradient end color")}
      <div class="field"><label for="d-angle">Gradient direction</label>
        <div class="range-row"><input type="range" id="d-angle" min="0" max="360" step="15"><output for="d-angle" id="d-angle-out"></output></div></div>
    </div>
    <h3 class="subhead">Corners</h3>
    <label class="check"><input type="checkbox" id="d-frame-same"> Corner frames use the dot color</label>
    <div data-show="frame-custom">${colorRow("frameColor", "Corner frame color")}</div>
    <label class="check"><input type="checkbox" id="d-center-same"> Corner centers use the dot color</label>
    <div data-show="center-custom">${colorRow("centerColor", "Corner center color")}</div>
    <h3 class="subhead">Background</h3>
    <label class="check"><input type="checkbox" id="d-bg-transparent"> Transparent background</label>
    <div data-show="bg-color">${colorRow("background", "Background color")}</div>`;

  const logoPanel = `
    <p class="hint" style="margin-top:0">Your picture stays on this device. It is never uploaded.</p>
    <div id="logo-empty" class="dropzone" data-dropzone>
      ${icon("upload")}
      <strong>Drop a logo or profile picture here</strong>
      <span class="hint">PNG, JPG, WebP, GIF or SVG, up to 3 MB</span>
      <label class="btn btn--sm btn--outline" for="d-logo-file">Choose a picture</label>
      <input type="file" id="d-logo-file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">
    </div>
    <p class="error" id="logo-error" role="alert">${icon("circleAlert")}<span></span></p>
    <div id="logo-set" hidden>
      <div class="logo-state"><img alt="" id="logo-thumb" width="56" height="56"><div><strong id="logo-name"></strong><br><button type="button" class="btn btn--sm btn--outline" id="d-logo-remove">${icon("trash")} Remove</button></div></div>
      <div class="field"><span class="label" id="logo-shape-label">Picture shape</span>
        <div class="segmented" role="radiogroup" aria-labelledby="logo-shape-label">
          <label><input type="radio" name="logoShape" value="square"><span>Square</span></label>
          <label><input type="radio" name="logoShape" value="round"><span>Round</span></label>
        </div></div>
      <div class="field"><label for="d-logo-size">Picture size</label>
        <div class="range-row"><input type="range" id="d-logo-size" min="${Math.round(LOGO_MIN * 100)}" max="${Math.round(LOGO_MAX * 100)}" step="1"><output for="d-logo-size" id="d-logo-size-out"></output></div>
        <p class="hint">Smaller is safer. Under 22% is best.</p></div>
    </div>`;

  const optionsPanel = `
    <div class="field"><label for="d-margin">Empty border</label>
      <div class="range-row"><input type="range" id="d-margin" min="${MARGIN_MIN}" max="${MARGIN_MAX}" step="1"><output for="d-margin" id="d-margin-out"></output></div>
      <p class="hint">Space around the code, counted in small squares. Keep it at 4 or more.</p></div>
    <div class="field"><label for="d-ecc">Error correction</label>
      <select class="select" id="d-ecc">${ECC_CHOICES.map((c) => `<option value="${c.id}">${esc(c.label)}. ${esc(c.detail)}</option>`).join("")}</select>
      <p class="hint" id="d-ecc-note"></p></div>`;

  const panels: Record<TabId, string> = { templates: templatePanel, shapes: shapesPanel, colors: colorsPanel, logo: logoPanel, options: optionsPanel };
  const panelHtml = TABS.map(
    (t, i) => `<div class="tabpanel" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}" ${i === 0 ? "" : "hidden"} tabindex="0">${panels[t.id]}</div>`,
  ).join("");

  return `<div class="card-head"><span class="step" aria-hidden="true">3</span><h2 id="design-heading">Design it</h2></div>
    <div class="tablist" role="tablist" aria-labelledby="design-heading">${tablist}</div>${panelHtml}`;
}

function previewHtml(): string {
  return `
  <div class="ticket" id="ticket">
    <div class="ticket-stage stage" id="ticket-stage">
      <div class="viewfinder"><i></i><i></i><i></i><i></i><div class="plate" id="plate"></div></div>
      <p class="ticket-caption stage-soft" id="ticket-caption"></p>
      <span class="ticket-badge" id="verdict" data-verdict="good" aria-live="polite"><span id="verdict-icon"></span><span id="verdict-label">Scans well</span></span>
    </div>
    <div class="tear" aria-hidden="true"></div>
    <div class="ticket-body">
      <div class="too-long" id="too-long" role="alert">This is too much for one QR code. Shorten the content, or lower the error correction on the Options tab.</div>
      <h3 class="subhead">Scan check</h3>
      <ul class="scan-list" id="scan-list"></ul>
      <div class="download-row">
        <div class="field"><label for="png-size">PNG size</label>
          <select class="select" id="png-size">${PNG_SIZES.map((s) => `<option value="${s}" ${s === 1024 ? "selected" : ""}>${s} × ${s} pixels${s === 512 ? " (screens)" : s === 2048 ? " (print)" : ""}</option>`).join("")}</select></div>
        <div class="download-actions">
          <button class="btn" type="button" data-action="download-png">${icon("download")}<span>Download PNG</span></button>
          <button class="btn btn--outline" type="button" data-action="download-svg">${icon("download")}<span>Download SVG</span></button>
          <button class="btn btn--outline btn--wide" type="button" data-action="copy-image">${icon("copy")}<span>Copy image</span></button>
        </div>
      </div>
    </div>
  </div>
  <section class="card" aria-labelledby="share-heading">
    <div class="card-head"><span class="step" aria-hidden="true">4</span><h2 id="share-heading">Share it</h2></div>
    <p class="share-note" id="share-note"></p>
    <ul class="share-grid">
      <li><a class="share-btn" data-network="facebook" target="_blank" rel="noopener noreferrer">${icon("facebook")}<span>Facebook</span></a></li>
      <li><button class="share-btn" type="button" data-network="instagram" data-action="share-instagram">${icon("instagram")}<span>Instagram</span></button></li>
      <li><a class="share-btn" data-network="whatsapp" target="_blank" rel="noopener noreferrer">${icon("whatsapp")}<span>WhatsApp</span></a></li>
      <li><a class="share-btn" data-network="linkedin" target="_blank" rel="noopener noreferrer">${icon("linkedin")}<span>LinkedIn</span></a></li>
      <li><a class="share-btn" data-network="x" target="_blank" rel="noopener noreferrer">${icon("x")}<span>X</span></a></li>
      <li><button class="share-btn" type="button" data-action="copy-link">${icon("link")}<span>Copy link</span></button></li>
    </ul>
    <button class="btn btn--outline btn--block" type="button" data-action="share-image" hidden>${icon("share")}<span>Share image</span></button>
  </section>`;
}

// ---- 3 to 5. The studio ----------------------------------------------------------------------

export function initStudio(): void {
  const root = qs<HTMLElement>("#studio");
  if (!root) return;

  const state: State = {
    type: "url",
    values: {},
    touched: new Set(),
    showAll: false,
    templateId: "saffron",
    style: styleFromTemplate("saffron"),
    logo: null,
    pngSize: 1024,
    tab: "templates",
  };

  root.innerHTML = `
    <div class="studio-content">
      <section class="card" aria-labelledby="content-heading">
        <div class="card-head"><span class="step" aria-hidden="true">1</span><h2 id="content-heading">What is it for?</h2></div>
        <div class="type-grid" role="radiogroup" aria-labelledby="content-heading" id="type-grid">${typeTilesHtml(state.type)}</div>
        <div class="card-head"><span class="step" aria-hidden="true">2</span><h2 id="details-heading">Add the details</h2></div>
        <div id="form-fields" role="group" aria-labelledby="details-heading"></div>
      </section>
    </div>
    <div class="studio-design"><section class="card" id="design-card">${designHtml()}</section></div>
    <div class="studio-preview">${previewHtml()}</div>`;

  const formFields = must<HTMLElement>("#form-fields", root);
  const plate = must<HTMLElement>("#plate", root);
  const stageEl = must<HTMLElement>("#ticket-stage", root);
  const captionEl = must<HTMLElement>("#ticket-caption", root);
  const verdictEl = must<HTMLElement>("#verdict", root);
  const verdictIcon = must<HTMLElement>("#verdict-icon", root);
  const verdictLabel = must<HTMLElement>("#verdict-label", root);
  const scanList = must<HTMLElement>("#scan-list", root);
  const tooLongEl = must<HTMLElement>("#too-long", root);
  const shareNote = must<HTMLElement>("#share-note", root);
  const shareImageBtn = must<HTMLButtonElement>('[data-action="share-image"]', root);

  let built: Built = { result: { ok: false, empty: true, errors: {} }, matrix: null, tooLong: false, report: null, ready: false };

  // -- state helpers ----------------------------------------------------------------------

  const currentValues = (): Values => {
    const existing = state.values[state.type];
    if (existing) return existing;
    const fresh = defaultValues(state.type);
    state.values[state.type] = fresh;
    return fresh;
  };

  const currentLogo = (): QrLogo | null =>
    state.logo
      ? { href: state.logo.shape === "round" ? state.logo.assets.cover : state.logo.assets.contain, shape: state.logo.shape, size: state.logo.size }
      : null;

  const exportSvg = (pixels?: number): string => {
    if (!built.matrix) return "";
    return renderSvg(built.matrix, state.style, currentLogo(), {
      size: pixels,
      idPrefix: pixels ? "exp" : "pv",
      title: built.result.ok ? built.result.summary : "Example QR code",
      standalone: Boolean(pixels),
    });
  };

  // -- the form ---------------------------------------------------------------------------

  function renderForm(): void {
    const def = getType(state.type);
    const values = currentValues();
    formFields.className = state.type === "contact" ? "grid-2" : "";
    formFields.innerHTML = def.fields.map((f) => fieldHtml(f, values[f.id] ?? "")).join("");
    applyShowWhen();
    refreshErrors();
  }

  function applyShowWhen(): void {
    const def = getType(state.type);
    const values = currentValues();
    for (const f of def.fields) {
      if (!f.showWhen) continue;
      const other = values[f.showWhen.field] ?? "";
      const visible = f.showWhen.notEqual !== undefined ? other !== f.showWhen.notEqual : other === f.showWhen.equals;
      const wrap = qs<HTMLElement>(`[data-field-wrap="${f.id}"]`, formFields);
      if (wrap) wrap.hidden = !visible;
    }
  }

  function refreshErrors(): void {
    const errors = built.result.ok ? {} : built.result.errors;
    const def = getType(state.type);
    for (const f of def.fields) {
      const input = qs<HTMLInputElement>(`#f-${f.id}`, formFields);
      const err = qs<HTMLElement>(`#f-${f.id}-err`, formFields);
      if (!input || !err) continue;
      const message = errors[f.id];
      const show = Boolean(message) && (state.showAll || state.touched.has(`${state.type}.${f.id}`));
      input.setAttribute("aria-invalid", String(show));
      err.classList.toggle("is-visible", show);
      const span = qs<HTMLElement>("span", err);
      if (span) span.textContent = show && message ? message : "";
    }
  }

  // -- design controls --------------------------------------------------------------------

  function setHex(id: string, value: string): void {
    const picker = qs<HTMLInputElement>(`[data-color="${id}"]`, root!);
    const text = qs<HTMLInputElement>(`[data-hex="${id}"]`, root!);
    const hex = normalizeHex(value, "#000000");
    if (picker) picker.value = hex;
    if (text && document.activeElement !== text) {
      text.value = hex;
      text.setAttribute("aria-invalid", "false");
    }
  }

  function syncDesign(): void {
    const s = state.style;
    // Templates
    qsa<HTMLInputElement>('input[name="template"]', root!).forEach((r) => (r.checked = r.value === state.templateId));
    const note = qs<HTMLElement>("#template-note", root!);
    if (note) note.textContent = state.templateId ? "" : "You changed the colors or shapes, so this is a custom style.";
    // Shapes
    qsa<HTMLInputElement>('input[name="dotShape"]', root!).forEach((r) => (r.checked = r.value === s.dotShape));
    qsa<HTMLInputElement>('input[name="frameShape"]', root!).forEach((r) => (r.checked = r.value === s.frameShape));
    qsa<HTMLInputElement>('input[name="centerShape"]', root!).forEach((r) => (r.checked = r.value === s.centerShape));
    // Colors
    qsa<HTMLInputElement>('input[name="fillMode"]', root!).forEach((r) => (r.checked = r.value === s.fillMode));
    setHex("dotColor", s.dotColor);
    setHex("gradientTo", s.gradientTo);
    setHex("frameColor", s.frameColor ?? s.dotColor);
    setHex("centerColor", s.centerColor ?? s.dotColor);
    setHex("background", s.background ?? "#ffffff");
    const angle = must<HTMLInputElement>("#d-angle", root!);
    angle.value = String(s.gradientAngle);
    must("#d-angle-out", root!).textContent = `${s.gradientAngle}°`;
    must<HTMLInputElement>("#d-frame-same", root!).checked = s.frameColor === null;
    must<HTMLInputElement>("#d-center-same", root!).checked = s.centerColor === null;
    must<HTMLInputElement>("#d-bg-transparent", root!).checked = s.background === null;
    const show = (key: string, visible: boolean) => qsa<HTMLElement>(`[data-show="${key}"]`, root!).forEach((el) => (el.hidden = !visible));
    show("gradient", s.fillMode === "gradient");
    show("frame-custom", s.frameColor !== null);
    show("center-custom", s.centerColor !== null);
    show("bg-color", s.background !== null);
    const dotLabel = must("#cl-dotColor", root!);
    dotLabel.textContent = s.fillMode === "gradient" ? "Gradient start color" : "Dots";
    // Options
    must<HTMLInputElement>("#d-margin", root!).value = String(s.margin);
    must("#d-margin-out", root!).textContent = String(s.margin);
    const eccSel = must<HTMLSelectElement>("#d-ecc", root!);
    eccSel.value = effectiveEcc(s, currentLogo());
    eccSel.disabled = state.logo !== null;
    must("#d-ecc-note", root!).textContent = state.logo
      ? "A logo is on the code, so error correction is set to the highest level automatically."
      : "";
    // Logo
    const hasLogo = state.logo !== null;
    must("#logo-empty", root!).hidden = hasLogo;
    must("#logo-set", root!).hidden = !hasLogo;
    if (state.logo) {
      const thumb = must<HTMLImageElement>("#logo-thumb", root!);
      thumb.src = state.logo.assets.contain;
      must("#logo-name", root!).textContent = state.logo.assets.name;
      qsa<HTMLInputElement>('input[name="logoShape"]', root!).forEach((r) => (r.checked = r.value === state.logo?.shape));
      const sizeInput = must<HTMLInputElement>("#d-logo-size", root!);
      sizeInput.value = String(Math.round(state.logo.size * 100));
      must("#d-logo-size-out", root!).textContent = `${Math.round(state.logo.size * 100)}%`;
    }
  }

  function setStyle(patch: Partial<QrStyle>, custom = true): void {
    state.style = { ...state.style, ...patch };
    if (custom) state.templateId = null;
    syncDesign();
    schedule();
  }

  function selectTab(id: TabId, focus = false): void {
    state.tab = id;
    qsa<HTMLElement>('[role="tab"]', root!).forEach((tab) => {
      const selected = tab.dataset.tab === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    qsa<HTMLElement>('[role="tabpanel"]', root!).forEach((panel) => (panel.hidden = panel.id !== `panel-${id}`));
  }

  // -- the preview ------------------------------------------------------------------------

  const schedule = frameThrottle(updatePreview);

  function updatePreview(): void {
    const values = currentValues();
    const result = buildPayload(state.type, values);
    let text: string;
    let sample = false;
    if (result.ok) {
      text = result.text;
    } else {
      const example = buildPayload(state.type, getType(state.type).example);
      text = example.ok ? example.text : "https://example.com";
      sample = true;
    }
    const logo = currentLogo();
    let matrix: QrMatrix | null = null;
    let tooLong = false;
    try {
      matrix = encodeText(text, effectiveEcc(state.style, logo), { boostEcc: true });
    } catch (error) {
      if (!(error instanceof QrTooLongError)) throw error;
      tooLong = true;
      const fallback = buildPayload(state.type, getType(state.type).example);
      matrix = encodeText(fallback.ok ? fallback.text : "https://example.com", "M");
      sample = true;
    }
    const report = scanCheck(matrix, state.style, logo);
    built = { result, matrix, tooLong, report, ready: result.ok && !tooLong };

    plate.innerHTML = exportSvg();
    plate.classList.toggle("is-sample", sample);
    plate.style.background = state.style.background ?? "#ffffff";
    captionEl.textContent = result.ok && !tooLong
      ? `${result.summary}. Scan it with your phone camera.`
      : "This is an example. Fill in your details to make your own code.";
    tooLongEl.classList.toggle("is-visible", tooLong);

    const colors = stageFor(state.style, state.templateId);
    applyStage(stageEl, colors);

    // Scan check
    scanList.innerHTML = report.checks
      .map((c) => `<li data-status="${c.status}">${icon(c.status === "pass" ? "circleCheck" : c.status === "warn" ? "warning" : "circleAlert")}<div><strong>${esc(c.title)}</strong><span>${esc(c.detail)}</span></div></li>`)
      .join("");
    verdictEl.dataset.verdict = report.verdict;
    verdictIcon.innerHTML = icon(report.verdict === "good" ? "circleCheck" : report.verdict === "notes" ? "warning" : "circleAlert");
    if (verdictLabel.textContent !== report.label) verdictLabel.textContent = report.label;

    refreshErrors();
    updateShare();
  }

  // -- sharing ----------------------------------------------------------------------------

  function shareInfo(): { url?: string; text: string } {
    const r = built.result;
    if (r.ok && r.shareUrl) return { url: r.shareUrl, text: "Scan or open this link:" };
    return { url: siteUrl(), text: "I made a QR code with QR Signature." };
  }

  function updateShare(): void {
    const info = shareInfo();
    const links = buildShareLinks(info);
    let anyMissing = false;
    for (const link of links) {
      const a = qs<HTMLAnchorElement>(`a[data-network="${link.network}"]`, root!);
      if (!a) continue;
      if (link.href) {
        a.href = link.href;
        a.removeAttribute("aria-disabled");
        a.removeAttribute("title");
      } else {
        anyMissing = true;
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
        a.setAttribute("role", "link");
        a.title = link.unavailable ?? "";
        a.dataset.reason = link.unavailable ?? "";
      }
    }
    shareNote.textContent = anyMissing
      ? "Facebook and LinkedIn share a web address. Make a website-link code, or download the image and post it."
      : info.url
        ? "These buttons open each network's own share screen. Nothing is posted until you confirm there."
        : "";
    const copyBtn = must<HTMLButtonElement>('[data-action="copy-link"]', root!);
    copyBtn.disabled = !info.url;
    copyBtn.title = info.url ? "" : "There is no web address to copy for this kind of code.";
    shareImageBtn.hidden = typeof navigator.share !== "function";
  }

  // -- actions ----------------------------------------------------------------------------

  /** Shows the spinner, then a check mark, on a button while an action runs. */
  async function busy(btn: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
    const original = btn.innerHTML;
    const label = qs<HTMLElement>("span", btn)?.textContent ?? "";
    btn.classList.add("is-working");
    const first = qs<SVGElement>(".icon", btn);
    if (first) first.outerHTML = icon("loader");
    try {
      await action();
      btn.classList.remove("is-working");
      btn.classList.add("is-done");
      btn.innerHTML = `${icon("check")}<span>${esc(label)}</span>`;
      window.setTimeout(() => {
        btn.classList.remove("is-done");
        btn.innerHTML = original;
      }, 1600);
    } catch (error) {
      btn.classList.remove("is-working");
      btn.innerHTML = original;
      toast(error instanceof Error && error.message ? error.message : "That did not work. Please try again.", "error");
    }
  }

  /** Makes sure there is a real code to save. If not, shows what to fix. */
  function ensureReady(): boolean {
    if (built.ready) return true;
    state.showAll = true;
    refreshErrors();
    if (built.tooLong) {
      toast("This is too much content for one QR code. Shorten it first.", "error");
      return false;
    }
    const first = qsa<HTMLElement>('[aria-invalid="true"]', formFields)[0];
    first?.focus();
    toast("Fix the highlighted details first, then try again.", "error");
    return false;
  }

  async function makePng(pixels: number): Promise<Blob> {
    return svgToPngBlob(exportSvg(pixels), pixels);
  }

  const label = () => fileLabel(state.type);

  async function handleAction(action: string, btn: HTMLButtonElement): Promise<void> {
    switch (action) {
      case "download-png":
        if (!ensureReady()) return;
        await busy(btn, async () => {
          downloadBlob(await makePng(state.pngSize), exportFileName(label(), "png", state.pngSize));
          toast(`PNG downloaded (${state.pngSize} × ${state.pngSize} pixels).`);
        });
        return;
      case "download-svg":
        if (!ensureReady()) return;
        await busy(btn, async () => {
          downloadSvg(exportSvg(1024), exportFileName(label(), "svg"));
          toast("SVG downloaded. It stays sharp at any size.");
        });
        return;
      case "copy-image":
        if (!ensureReady()) return;
        await busy(btn, async () => {
          const result = await copyImage(await makePng(1024));
          if (result === "unsupported") throw new Error("This browser cannot copy images. Use Download PNG instead.");
          toast("Image copied. Paste it into a message or document.");
        });
        return;
      case "copy-link": {
        const url = shareInfo().url;
        if (!url) return;
        await busy(btn, async () => {
          const result = await copyText(url);
          if (result === "unsupported") throw new Error("This browser blocked copying. Select the link and copy it by hand.");
          toast("Link copied.");
        });
        return;
      }
      case "share-image":
      case "share-instagram": {
        if (!ensureReady()) return;
        const png = await makePng(1024);
        const file = new File([png], exportFileName(label(), "png", 1024), { type: "image/png" });
        if (canShareFile(file)) {
          try {
            const outcome = await shareFile(file, "My QR code", shareInfo().text);
            if (outcome === "shared") toast("Shared.");
          } catch {
            toast("Sharing did not work. Download the image instead.", "error");
          }
        } else if (action === "share-instagram") {
          downloadBlob(png, file.name);
          toast("Instagram has no web share link, so we saved the image. Open Instagram and post it from your pictures.", "info", 7000);
        } else {
          toast("This device cannot share images directly. Use Download PNG instead.", "info");
        }
        return;
      }
      case "reveal": {
        const id = btn.getAttribute("aria-controls") ?? "";
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Hide" : "Show";
        btn.setAttribute("aria-pressed", String(show));
        return;
      }
    }
  }

  async function takeLogo(file: File): Promise<void> {
    const errorBox = must<HTMLElement>("#logo-error", root!);
    const result = await prepareLogo(file);
    if (!result.ok) {
      errorBox.classList.add("is-visible");
      must("span", errorBox).textContent = result.error;
      toast(result.error, "error");
      return;
    }
    errorBox.classList.remove("is-visible");
    state.logo = { assets: result.assets, shape: "square", size: LOGO_DEFAULT };
    syncDesign();
    schedule();
    toast("Logo added. Error correction is now set to the highest level so the code still scans.", "info", 6000);
  }

  // -- events -----------------------------------------------------------------------------

  root.addEventListener("input", (event) => {
    const el = event.target as HTMLInputElement;
    // Form fields
    const fieldId = el.dataset?.field;
    if (fieldId) {
      currentValues()[fieldId] = el.type === "checkbox" ? (el.checked ? "true" : "") : el.value;
      applyShowWhen();
      schedule();
      return;
    }
    // Color pickers and hex text boxes
    const colorId = el.dataset?.color;
    const hexId = el.dataset?.hex;
    if (colorId || hexId) {
      const key = (colorId ?? hexId) as "dotColor" | "gradientTo" | "frameColor" | "centerColor" | "background";
      let value = el.value.trim();
      if (hexId) {
        if (!isHexColor(value)) {
          el.setAttribute("aria-invalid", "true");
          return;
        }
        el.setAttribute("aria-invalid", "false");
        value = normalizeHex(value);
      }
      setStyle({ [key]: value } as Partial<QrStyle>);
      return;
    }
    switch (el.id) {
      case "d-angle":
        setStyle({ gradientAngle: Number(el.value) });
        return;
      case "d-margin":
        setStyle({ margin: clampMargin(Number(el.value)) }, false);
        return;
      case "d-logo-size":
        if (state.logo) {
          state.logo.size = clampLogoSize(Number(el.value) / 100);
          syncDesign();
          schedule();
        }
        return;
    }
  });

  root.addEventListener("change", (event) => {
    const el = event.target as HTMLInputElement;
    const fieldId = el.dataset?.field;
    if (fieldId) {
      currentValues()[fieldId] = el.type === "checkbox" ? (el.checked ? "true" : "") : el.value;
      applyShowWhen();
      schedule();
      return;
    }
    switch (el.name) {
      case "qr-type":
        if (isQrType(el.value)) {
          state.type = el.value;
          state.showAll = false;
          renderForm();
          schedule();
        }
        return;
      case "template": {
        const tpl = getTemplate(el.value);
        if (tpl) {
          state.templateId = tpl.id;
          state.style = styleFromTemplate(tpl.id, { margin: state.style.margin, ecc: state.style.ecc });
          syncDesign();
          schedule();
        }
        return;
      }
      case "dotShape":
        setStyle({ dotShape: el.value as DotShape });
        return;
      case "frameShape":
        setStyle({ frameShape: el.value as FrameShape });
        return;
      case "centerShape":
        setStyle({ centerShape: el.value as CenterShape });
        return;
      case "fillMode":
        setStyle({ fillMode: el.value === "gradient" ? "gradient" : "solid" });
        return;
      case "logoShape":
        if (state.logo) {
          state.logo.shape = el.value === "round" ? "round" : "square";
          syncDesign();
          schedule();
        }
        return;
    }
    switch (el.id) {
      case "d-frame-same":
        setStyle({ frameColor: el.checked ? null : state.style.dotColor });
        return;
      case "d-center-same":
        setStyle({ centerColor: el.checked ? null : state.style.dotColor });
        return;
      case "d-bg-transparent":
        setStyle({ background: el.checked ? null : "#ffffff" });
        return;
      case "d-ecc":
        setStyle({ ecc: el.value as QrStyle["ecc"] }, false);
        return;
      case "png-size":
        state.pngSize = Number(el.value) || 1024;
        return;
      case "d-logo-file":
        if (el.files?.[0]) void takeLogo(el.files[0]);
        el.value = "";
        return;
    }
  });

  root.addEventListener("focusout", (event) => {
    const el = event.target as HTMLInputElement;
    if (el.dataset?.field) {
      state.touched.add(`${state.type}.${el.dataset.field}`);
      refreshErrors();
    }
    // A hex box left with a bad value goes back to the real colour.
    if (el.dataset?.hex && el.getAttribute("aria-invalid") === "true") {
      const key = el.dataset.hex as "dotColor" | "gradientTo" | "frameColor" | "centerColor" | "background";
      el.value = normalizeHex(String(state.style[key] ?? state.style.dotColor));
      el.setAttribute("aria-invalid", "false");
    }
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>('[role="tab"]');
    if (tab?.dataset.tab) {
      selectTab(tab.dataset.tab as TabId);
      return;
    }
    const disabledLink = target.closest<HTMLElement>('a[aria-disabled="true"]');
    if (disabledLink) {
      event.preventDefault();
      toast(disabledLink.dataset.reason || "This is not available for this kind of code.", "info", 6000);
      return;
    }
    if (target.closest("#d-logo-remove")) {
      state.logo = null;
      syncDesign();
      schedule();
      toast("Logo removed.", "info");
      return;
    }
    const btn = target.closest<HTMLButtonElement>("button[data-action]");
    if (btn && !btn.disabled) void handleAction(btn.dataset.action ?? "", btn);
  });

  // Arrow keys move between tabs.
  root.addEventListener("keydown", (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!tab) return;
    const ids = TABS.map((t) => t.id);
    const index = ids.indexOf(tab.dataset.tab as TabId);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % ids.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    if (next >= 0) {
      event.preventDefault();
      selectTab(ids[next] as TabId, true);
    }
  });

  // Drag and drop for the logo.
  const zone = qs<HTMLElement>("[data-dropzone]", root);
  if (zone) {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("is-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-over");
      const file = e.dataTransfer?.files?.[0];
      if (file) void takeLogo(file);
    });
  }

  // -- start-up: pick up a hand-off from the home page or a template link ------------------

  const params = new URLSearchParams(window.location.search);
  const typeParam = params.get("type");
  const templateParam = params.get("template");
  if (typeParam && isQrType(typeParam)) state.type = typeParam;
  if (templateParam && getTemplate(templateParam)) {
    state.templateId = templateParam;
    state.style = styleFromTemplate(templateParam);
  }
  const handoff = safeSessionGet("qrs.handoff");
  if (handoff) {
    safeSessionRemove("qrs.handoff");
    try {
      const data = JSON.parse(handoff) as { type?: string; values?: Values; templateId?: string };
      if (data.type && isQrType(data.type)) {
        state.type = data.type;
        state.values[data.type] = { ...defaultValues(data.type), ...(data.values ?? {}) };
      }
      if (data.templateId && getTemplate(data.templateId)) {
        state.templateId = data.templateId;
        state.style = styleFromTemplate(data.templateId);
      }
    } catch {
      /* a broken hand-off is ignored */
    }
  }
  const checked = qs<HTMLInputElement>(`input[name="qr-type"][value="${state.type}"]`, root);
  if (checked) checked.checked = true;

  renderForm();
  syncDesign();
  selectTab("templates");
  updatePreview();

}
