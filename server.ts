import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { ensureSeeded } from './src/db/seed.ts';
import { setSocketServer } from './src/server/utils/audit.ts';
import authRoutes from './src/server/routes/auth.ts';
import usersRoutes from './src/server/routes/users.ts';
import catalogRoutes from './src/server/routes/catalog.ts';
import inventoryRoutes from './src/server/routes/inventory.ts';
import commerceRoutes from './src/server/routes/commerce.ts';
import analyticsRoutes from './src/server/routes/analytics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: "Naceni's Business API" });
  });

  app.use('/api', async (_req, _res, next) => {
    await ensureSeeded();
    next();
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', inventoryRoutes);
  app.use('/api', commerceRoutes);
  app.use('/api', analyticsRoutes);

  app.get('/api/docs', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <title>Naceni's Business API Docs</title>
  <meta charset="utf-8" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 880px; color: #0f172a; background: #f8fafc; padding: 0 1rem; }
    h1 { color: #0b1f3a; }
    pre { background: #0f172a; color: #e2e8f0; padding: 1.25rem; border-radius: 10px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Naceni's Business — OpenAPI 3.0 Reference</h1>
  <p>Live OpenAPI JSON specification: <a href="/api/docs/openapi.json">/api/docs/openapi.json</a></p>
  <pre id="spec">Loading specification...</pre>
  <script>
    fetch('/api/docs/openapi.json').then(r => r.json()).then(d => {
      document.getElementById('spec').textContent = JSON.stringify(d, null, 2);
    });
  </script>
</body>
</html>`);
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: true, credentials: true },
  });
  setSocketServer(io);

  io.on('connection', (socket) => {
    socket.emit('connected', { timestamp: new Date().toISOString() });
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Naceni's Business running on http://0.0.0.0:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
