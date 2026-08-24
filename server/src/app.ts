import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { config } from './config';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import roomRoutes from './routes/room.routes';
import { HttpError } from './types';

export function createApp(): express.Express {
  const app = express();

  // Behind Nginx / a load balancer — needed for correct rate-limit IPs.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.clientUrl.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Global API budget (per-IP); tighter limits live on auth/join routes.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 500,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    }),
  );

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler — HttpError carries an explicit status code.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      res.status(400).json({ error: 'Malformed JSON body' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[http] unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
