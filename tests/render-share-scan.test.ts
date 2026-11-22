import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeText } from "../src/ts/qr/encoder";
import { renderSvg, logoCoverage } from "../src/ts/qr/render";
import { scanCheck } from "../src/ts/qr/scan";
import { buildShareLinks, siteUrl } from "../src/ts/lib/share";
import { exportFileName } from "../src/ts/qr/export";
import { checkLogoFile, MAX_LOGO_BYTES } from "../src/ts/lib/logo";
import { DEFAULT_STYLE, DOT_SHAPES, CENTER_SHAPES, FRAME_SHAPES, styleFromTemplate, TEMPLATES, type QrLogo } from "../src/ts/qr/style";

const matrix = encodeText("https://example.com", "M");
const PNG_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("every dot, frame and centre shape draws something", () => {
  for (const dot of DOT_SHAPES) for (const frame of FRAME_SHAPES) for (const center of CENTER_SHAPES) {
    const svg = renderSvg(matrix, { ...DEFAULT_STYLE, dotShape: dot.id, frameShape: frame.id, centerShape: center.id });
    assert.ok(svg.startsWith("<svg") && svg.includes("<path"), `${dot.id}/${frame.id}/${center.id}`);
  }
});

test("standalone SVG has a size and a namespace; inline SVG does not need one", () => {
  const s = renderSvg(matrix, DEFAULT_STYLE, null, { size: 1024, standalone: true, title: "Test" });
  assert.ok(s.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(s.includes('width="1024"') && s.includes('height="1024"'));
});

test("the SVG title is escaped", () => {
  const svg = renderSvg(matrix, DEFAULT_STYLE, null, { title: '</title><script>alert(1)</script>"' });
  assert.ok(!svg.includes("<script"));
});

test("transparent background draws no background rectangle", () => {
  const opaque = renderSvg(matrix, { ...DEFAULT_STYLE, background: "#ffffff" });
  const clear = renderSvg(matrix, { ...DEFAULT_STYLE, background: null });
  assert.ok(opaque.length > clear.length);
  assert.ok(!/fill="#ffffff"/i.test(clear.split("<path")[0] ?? ""));
});

test("gradient colours appear", () => {
  const svg = renderSvg(matrix, { ...DEFAULT_STYLE, fillMode: "gradient", dotColor: "#112233", gradientTo: "#aabbcc" }, null, { idPrefix: "t" });
  assert.ok(svg.includes("linearGradient") && svg.includes("#112233") && svg.includes("#aabbcc") && svg.includes("url(#t-g)"));
});

test("a logo is drawn only if it is a safe picture data URL", () => {
  const good: QrLogo = { href: PNG_DATA, shape: "square", size: 0.2 };
  assert.ok(renderSvg(matrix, DEFAULT_STYLE, good).includes("<image"));
  const round: QrLogo = { href: PNG_DATA, shape: "round", size: 0.2 };
  assert.ok(renderSvg(matrix, DEFAULT_STYLE, round).includes("clipPath"));
  for (const evil of ["javascript:alert(1)", "https://evil.example/x.png", "data:text/html;base64,PGI+eDwvYj4=", 'data:image/png;base64,AAAA" onload="alert(1)', "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", ""]) {
    const svg = renderSvg(matrix, DEFAULT_STYLE, { href: evil, shape: "square", size: 0.2 });
    assert.ok(!svg.includes("<image"), `rejected: ${evil.slice(0, 40)}`);
    assert.ok(!svg.includes("javascript:") && !svg.includes("evil.example"));
  }
});

test("logo coverage is a share of the width", () => {
  assert.equal(logoCoverage(matrix.size, null).cells, 0);
  const cov = logoCoverage(matrix.size, { size: 0.2 });
  assert.ok(cov.cells % 2 === 1 && cov.widthShare > 0 && cov.widthShare < 0.5 && Math.abs(cov.areaShare - cov.widthShare ** 2) < 1e-9);
});

test("scan check: dark on light is good, pale on pale is not", () => {
  const good = scanCheck(matrix, DEFAULT_STYLE, null);
  assert.equal(good.verdict, "good");
  assert.equal(good.label, "Scans well");
  const pale = scanCheck(matrix, { ...DEFAULT_STYLE, dotColor: "#e8dfd0", background: "#fffaf2" }, null);
  assert.equal(pale.verdict, "risky");
  assert.equal(pale.label, "May not scan");
  assert.ok(pale.checks.some((c) => c.id === "contrast" && c.status === "fail"));
});

test("scan check: border, logo, inverted colours, transparent background", () => {
  assert.notEqual(scanCheck(matrix, { ...DEFAULT_STYLE, margin: 0 }, null).verdict, "good");
  const big = scanCheck(matrix, DEFAULT_STYLE, { href: PNG_DATA, shape: "square", size: 0.28 });
  assert.ok(big.checks.some((c) => c.id === "logo"));
  const inverted = scanCheck(matrix, { ...DEFAULT_STYLE, dotColor: "#ffffff", background: "#2c2416" }, null);
  assert.ok(inverted.checks.some((c) => c.id === "colors" && c.status === "warn"));
  const clear = scanCheck(matrix, { ...DEFAULT_STYLE, background: null }, null);
  assert.ok(clear.checks.some((c) => c.id === "background" && c.status !== "pass"));
  assert.ok(good2().minPrintCm >= 2);
  function good2() { return scanCheck(matrix, DEFAULT_STYLE, null); }
});

test("every template is allowed to scan (never 'May not scan')", () => {
  for (const t of TEMPLATES) {
    const report = scanCheck(matrix, styleFromTemplate(t.id), null);
    assert.notEqual(report.verdict, "risky", `${t.id}: ${report.contrastRatio}`);
  }
});

test("share links", () => {
  const links = Object.fromEntries(buildShareLinks({ url: "https://example.com/a?b=1&c=2", text: "Scan or open this link:" }).map((l) => [l.network, l]));
  assert.ok(links.facebook!.href!.startsWith("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2"));
  assert.ok(links.linkedin!.href!.startsWith("https://www.linkedin.com/sharing/share-offsite/?url="));
  assert.ok(links.whatsapp!.href!.startsWith("https://wa.me/?text="));
  assert.ok(decodeURIComponent(links.whatsapp!.href!).includes("https://example.com/a?b=1&c=2"));
  assert.ok(links.x!.href!.startsWith("https://x.com/intent/post?text="));
  assert.ok(links.x!.href!.includes("&url=https%3A%2F%2Fexample.com"));
  const none = Object.fromEntries(buildShareLinks({ text: "Hello" }).map((l) => [l.network, l]));
  assert.equal(none.facebook!.href, null);
  assert.equal(none.linkedin!.href, null);
  assert.ok(none.facebook!.unavailable && none.linkedin!.unavailable);
  assert.ok(none.whatsapp!.href && none.x!.href);
});

test("site address is only given on the web", () => {
  assert.equal(siteUrl({ protocol: "file:", origin: "null" }), undefined);
  assert.equal(siteUrl({ protocol: "https:", origin: "https://qrsignature.example" }), "https://qrsignature.example/");
});

test("file names are safe", () => {
  assert.equal(exportFileName("Website link", "png", 1024), "qr-signature-website-link-1024.png");
  assert.equal(exportFileName("../../etc/passwd", "svg"), "qr-signature-etc-passwd.svg");
  assert.equal(exportFileName("", "svg"), "qr-signature-code.svg");
});

test("logo file checks", () => {
  assert.equal(checkLogoFile({ type: "image/png", size: 1000 }), null);
  assert.equal(checkLogoFile({ type: "image/svg+xml", size: 1000 }), null);
  assert.ok(checkLogoFile({ type: "application/pdf", size: 1000 }));
  assert.ok(checkLogoFile({ type: "text/html", size: 10 }));
  assert.ok(checkLogoFile({ type: "image/png", size: MAX_LOGO_BYTES + 1 }));
});
