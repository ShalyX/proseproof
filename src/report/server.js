import express from 'express';
import path from 'node:path';
import { renderReport } from './render.js';

export function createApp({ runDir, report, liveReload = false }) {
  const app = express();
  app.use('/shots', express.static(path.join(runDir, 'shots'), { fallthrough: true }));
  app.get('/report.json', (req, res) => res.json(report));
  app.get('/health', (req, res) => res.json({ ok: true, mode: report.mode, policy: report.policy?.result }));
  app.get('/', (req, res) => {
    res.type('html').send(renderReport(report, { liveReload }));
  });
  if (liveReload) {
    const clients = new Set();
    app.get('/events', (req, res) => {
      res.setHeader('content-type', 'text/event-stream');
      res.setHeader('cache-control', 'no-cache');
      res.flushHeaders?.();
      clients.add(res);
      req.on('close', () => clients.delete(res));
    });
    app.locals.notifyReload = () => {
      for (const client of clients) client.write('event: reload\ndata: 1\n\n');
    };
  }
  return app;
}

export function startServer({ runDir, report, port = 0, liveReload = false }) {
  return new Promise((resolve) => {
    const app = createApp({ runDir, report, liveReload });
    const server = app.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        app,
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

export function serveForever({ runDir, report, port = 4178, liveReload = false }) {
  return startServer({ runDir, report, port, liveReload }).then((handle) => {
    console.log(`Truth Console: ${handle.url}`);
    console.log('Press Ctrl+C to stop.');
    return handle;
  });
}
