import { Router } from 'express';

import { config } from '../config';

const router = Router();

// Public — used by load balancers / uptime checks. No auth required.
router.get('/', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: Date.now(),
    storage: config.inMemory ? 'in-memory' : 'postgres',
  });
});

export default router;
