import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, isHexColor, luminance, mix, normalizeHex, parseHex } from "../src/ts/lib/color";
import { clampLogoSize, clampMargin, deriveStage, effectiveEcc, getTemplate, LOGO_DEFAULT, LOGO_MAX, LOGO_MIN, stageColors, stageFor, styleFromTemplate, TEMPLATES, DEFAULT_STYLE, type QrStyle } from "../src/ts/qr/style";

test("colour helpers", () => {
  assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex("#A8460A"), { r: 168, g: 70, b: 10 });
  assert.equal(parseHex("red"), null);
  assert.equal(isHexColor("#12345"), false);
  assert.equal(isHexColor("#123456"), true);
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("nope", "#112233"), "#112233");
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  assert.ok(luminance("#ffffff") > luminance("#000000"));
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
});

test("twelve templates with unique ids", () => {
  assert.equal(TEMPLATES.length, 12);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 12);
  for (const t of TEMPLATES) {
    assert.ok(getTemplate(t.id));
    const s = styleFromTemplate(t.id);
    assert.ok(isHexColor(s.dotColor), t.id);
  }
});

test("template text on the stage is readable (4.5 to 1 or better)", () => {
  for (const t of TEMPLATES) {
    const c = stageColors(t.stage);
    for (const bg of [c.from, c.to]) {
      assert.ok(contrast(c.fg, bg) >= 4.5, `${t.id} fg on ${bg}: ${contrast(c.fg, bg).toFixed(2)}`);
      assert.ok(contrast(c.soft, bg) >= 4.5, `${t.id} soft on ${bg}: ${contrast(c.soft, bg).toFixed(2)}`);
    }
  }
});

test("custom colours always get a readable stage", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 400; i++) {
    const hex = "#" + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, "0")).join("");
    const style: QrStyle = { ...DEFAULT_STYLE, dotColor: hex };
    const c = stageFor(style, null);
    for (const bg of [c.from, c.to]) {
      assert.ok(contrast(c.fg, bg) >= 4.5, `${hex} fg ${contrast(c.fg, bg).toFixed(2)}`);
      assert.ok(contrast(c.soft, bg) >= 4.5, `${hex} soft ${contrast(c.soft, bg).toFixed(2)}`);
    }
    assert.equal(deriveStage(style).deep, false);
  }
});

test("a logo forces the highest error correction", () => {
  const logo = { href: "data:image/png;base64,AAAA", shape: "square" as const, size: 0.2 };
  assert.equal(effectiveEcc({ ...DEFAULT_STYLE, ecc: "L" }, logo), "H");
  assert.equal(effectiveEcc({ ...DEFAULT_STYLE, ecc: "L" }, null), "L");
});

test("limits are enforced", () => {
  assert.equal(clampMargin(-3), 0);
  assert.equal(clampMargin(99), 8);
  assert.equal(clampMargin(3.6), 4);
  assert.equal(clampMargin(NaN), DEFAULT_STYLE.margin);
  assert.equal(clampLogoSize(0.01), LOGO_MIN);
  assert.equal(clampLogoSize(0.9), LOGO_MAX);
  assert.equal(clampLogoSize(NaN), LOGO_DEFAULT);
});

test("choosing a template keeps the chosen border and error correction", () => {
  const s = styleFromTemplate("ocean", { margin: 6, ecc: "Q" });
  assert.equal(s.margin, 6);
  assert.equal(s.ecc, "Q");
});
