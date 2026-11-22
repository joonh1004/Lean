import { defineConfig } from 'vite';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const writer = fileURLToPath(new URL('./tools/export_problem_hwpx.py', import.meta.url));
const maxBytes = 70 * 1024 * 1024;

function convert(python, png) {
  return new Promise((resolve, reject) => {
    const child = execFile(python, ['-B', writer], { encoding: 'buffer', maxBuffer: maxBytes + 1024 * 1024,
      timeout: 20000, windowsHide: true }, (error, bytes) => error ? reject(error) : resolve(bytes));
    child.stdin.on('error', reject);
    child.stdin.end(png);
  });
}

function localHwpx(python) {
  let busy = false;
  let probe;
  function checkWriter() {
    // The writer imports its dependencies before handling --help. No PNG is needed.
    probe ??= new Promise(resolve => {
      execFile(python, ['-B', writer, '--help'], { timeout: 5000, windowsHide: true }, error => resolve(!error));
    }).finally(() => { probe = undefined; });
    return probe;
  }
  const install = server => {
    server.middlewares.use('/api/problem-hwpx', async (req, res) => {
      const stop = code => { res.statusCode = code; res.end(); };
      if (!['HEAD', 'POST'].includes(req.method) || req.url !== '/') return stop(405);
      const host = req.headers.host || '';
      const origin = req.headers.origin;
      if (!/^127\.0\.0\.1:\d+$/.test(host) ||
          ((req.method === 'POST' || origin !== undefined) && origin !== `http://${host}`) ||
          !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return stop(403);
      if (!python) return stop(503);
      if (req.method === 'HEAD') {
        res.setHeader('Cache-Control', 'no-store');
        if (!await checkWriter()) return stop(503);
        res.setHeader('X-Lean-Hwpx', '1');
        return stop(204);
      }
      if (req.headers['content-type'] !== 'image/png') return stop(415);
      const length = Number(req.headers['content-length']);
      if (!Number.isSafeInteger(length) || length <= 0 || length > maxBytes) return stop(413);
      if (busy) return stop(429);
      busy = true;
      try {
        const chunks = [];
        let received = 0;
        for await (const chunk of req) {
          received += chunk.length;
          if (received > length) return stop(413);
          chunks.push(chunk);
        }
        if (received !== length) return stop(400);
        const output = await convert(python, Buffer.concat(chunks, received));
        res.setHeader('Content-Type', 'application/hwp+zip');
        res.setHeader('Content-Disposition', 'attachment; filename="problem.hwpx"');
        res.setHeader('Cache-Control', 'no-store');
        res.end(output);
      } catch {
        if (!res.destroyed) stop(422);
      } finally {
        busy = false;
      }
    });
  };
  return { name: 'lean-local-hwpx', configureServer: install, configurePreviewServer: install };
}

export default defineConfig({
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  plugins: [localHwpx(process.env.LEAN_HWPX_PYTHON)],
});
