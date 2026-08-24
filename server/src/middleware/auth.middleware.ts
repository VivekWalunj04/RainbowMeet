import type { NextFunction, Request, Response } from 'express';

import { verifyToken } from '../services/token.service';

/**
 * Express middleware — requires `Authorization: Bearer <app-jwt>`.
 * Applied to every API route except /api/health and /api/auth/*.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
