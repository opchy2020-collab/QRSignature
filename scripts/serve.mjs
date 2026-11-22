// A tiny web server for trying the site on your own computer (optional: you can also double-click index.html).
// Run it with:  npm run serve    then open http://localhost:4173

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 4173;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    // Only files inside the project folder, and never the source or tool folders.
    if (!file.startsWith(root + sep) || /[\\/](node_modules|src|scripts|tests|_work|\.git)[\\/]/.test(file)) throw new Error("blocked");
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(await readFile(file));
  } catch {
    try {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(join(root, "404.html")));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}).listen(port, () => console.log(`QR Signature is running at http://localhost:${port}  (press Ctrl+C to stop)`));
