// Builds the site.
//   1. Bundles the TypeScript in src/ts into one script: assets/js/app.js
//   2. Builds every page in src/pages into a finished .html file in the project root
//      (each page is wrapped in src/partials/layout.html, with the shared header and footer).
//
// Run it with:  npm run build
// It checks its own work: it stops with a clear message if a link points to a page that does not exist,
// or if a {{placeholder}} was left unfilled.

import { build } from "esbuild";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dev = process.argv.includes("--dev");

// ---- 1. The script ---------------------------------------------------------------------------

await build({
  entryPoints: [join(root, "src/ts/main.ts")],
  bundle: true,
  format: "iife", // a classic script, so the site also works when you double-click index.html
  target: "es2020",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "none",
  outfile: join(root, "assets/js/app.js"),
  banner: { js: "/* QR Signature. Built from src/ts. Edit the source, then run: npm run build */" },
  logLevel: "warning",
});

// ---- 2. Icons for the page templates ---------------------------------------------------------
// Pages can say {{icon:arrowRight}}. We load the same icon code the script uses.

const scratch = join(tmpdir(), `qrsig-build-${process.pid}`);
await mkdir(scratch, { recursive: true });
const iconBundle = join(scratch, "icons.mjs");
await build({
  entryPoints: [join(root, "src/ts/ui/icon.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: iconBundle,
  logLevel: "warning",
});
const { icon } = await import(pathToFileURL(iconBundle).href);

// ---- 3. Pages --------------------------------------------------------------------------------

const read = (file) => readFile(join(root, file), "utf8");
const layout = await read("src/partials/layout.html");
const header = await read("src/partials/header.html");
const footer = await read("src/partials/footer.html");

function parsePage(source, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: the page must start with a --- block giving title, description, page and nav.`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (m) meta[m[1]] = m[2];
  }
  for (const key of ["title", "description", "page", "nav"]) {
    if (meta[key] === undefined) throw new Error(`${file}: missing "${key}" in the --- block.`);
  }
  return { meta, body: match[2] };
}

const escAttr = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function fillIcons(html) {
  return html.replace(/\{\{icon:([a-zA-Z0-9]+)(?: ([a-z-]+))?\}\}/g, (_all, id, cls) => icon(id, cls ? { className: cls } : {}));
}

function markCurrent(html, nav) {
  // <a data-nav="create" ...> becomes aria-current="page" on the matching page; the helper attribute is removed.
  return html.replace(/\sdata-nav="([a-z-]+)"/g, (_all, id) => (id === nav ? ' aria-current="page"' : ""));
}

const pageFiles = (await readdir(join(root, "src/pages"))).filter((f) => f.endsWith(".html")).sort();
const outputs = new Map();
const outName = (file) => (file === "home.html" ? "index.html" : file);
const year = String(new Date().getFullYear());

for (const file of pageFiles) {
  const { meta, body } = parsePage(await read(`src/pages/${file}`), file);
  let html = layout
    .replace("{{header}}", header)
    .replace("{{footer}}", footer)
    .replace("{{content}}", body)
    .replaceAll("{{title}}", escAttr(meta.title))
    .replaceAll("{{description}}", escAttr(meta.description))
    .replaceAll("{{page}}", escAttr(meta.page))
    .replaceAll("{{year}}", year);
  html = fillIcons(markCurrent(html, meta.nav));
  outputs.set(outName(file), html);
}

// ---- 4. Checks -------------------------------------------------------------------------------

const problems = [];
for (const [file, html] of outputs) {
  const left = html.match(/\{\{[^}]*\}\}/g);
  if (left) problems.push(`${file}: unfilled placeholder ${left[0]}`);
  for (const m of html.matchAll(/href="([^"#?]+\.html)(?:[#?][^"]*)?"/g)) {
    if (!outputs.has(m[1])) problems.push(`${file}: link to ${m[1]}, but there is no such page in src/pages`);
  }
  if (!/<main id="main"/.test(html)) problems.push(`${file}: missing <main id="main">`);
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push(`${file}: needs exactly one <h1>`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) problems.push(`${file}: duplicate id "${dupes[0]}"`);
}
if (problems.length) {
  console.error("\nBuild stopped. Please fix:\n - " + problems.join("\n - "));
  await rm(scratch, { recursive: true, force: true });
  process.exit(1);
}

// ---- 5. Write --------------------------------------------------------------------------------

for (const [name, html] of outputs) {
  await writeFile(join(root, name), html);
}
await rm(scratch, { recursive: true, force: true });
if (!existsSync(join(root, "assets/css/styles.css"))) throw new Error("assets/css/styles.css is missing.");
console.log(`Built ${outputs.size} pages and assets/js/app.js${dev ? " (development build)" : ""}.`);
