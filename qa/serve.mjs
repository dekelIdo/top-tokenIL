/**
 * Minimal static server with SPA history fallback, used for QA runs.
 * Serves the production build the same way a static host would.
 *
 * Exported so QA scripts can own the server lifecycle in-process rather than
 * depending on a separate long-running shell.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function startServer(port = 4321, root = join(process.cwd(), 'dist', 'top-token')) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let filePath = resolve(root, `.${normalize(decodeURIComponent(url.pathname))}`);

    if (!filePath.startsWith(root)) {
      filePath = join(root, 'index.html');
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {
      filePath = join(root, 'index.html'); // SPA history fallback
    }

    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });

  return new Promise((resolveReady) => {
    server.listen(port, () => resolveReady(server));
  });
}

// Allow running standalone: node qa/serve.mjs [port]
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const port = Number(process.argv[2] ?? 4321);
  await startServer(port);
  console.log(`QA static server on http://localhost:${port}`);
}
