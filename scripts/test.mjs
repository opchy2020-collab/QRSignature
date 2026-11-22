// Runs the automatic tests in tests/. They are written in TypeScript, so they are bundled first.
// Run it with:  npm test

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = await mkdtemp(join(tmpdir(), "qrsig-tests-"));
let status = 1;
try {
  const files = (await readdir(join(root, "tests"))).filter((f) => f.endsWith(".test.ts"));
  if (files.length === 0) throw new Error("No test files found in tests/.");
  await build({
    entryPoints: files.map((f) => join(root, "tests", f)),
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: out,
    outExtension: { ".js": ".mjs" },
    logLevel: "warning",
  });
  const compiled = files.map((f) => join(out, f.replace(/\.ts$/, ".mjs")));
  const result = spawnSync(process.execPath, ["--test", ...compiled], { stdio: "inherit", cwd: root });
  status = result.status ?? 1;
} finally {
  await rm(out, { recursive: true, force: true });
}
process.exit(status);
