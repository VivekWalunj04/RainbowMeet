import jwt from 'jsonwebtoken';

import { config } from '../config';
import type { AuthUser } from '../types';

/** Sign a short-lived app-level JWT for a guest or registered user. */
export function issueToken(user: AuthUser): string {
  return jwt.sign({ name: user.name, kind: user.kind }, config.jwtSecret, {
    subject: user.sub,
    expiresIn: config.jwtTtlSeconds,
  });
}

/** Verify an app-level JWT; throws on invalid/expired tokens. */
export function verifyToken(token: string): AuthUser {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  if (!decoded.sub || typeof decoded.name !== 'string') {
    throw new Error('Malformed token payload');
  }
  return { sub: decoded.sub, name: decoded.name, kind: decoded.kind === 'user' ? 'user' : 'guest' };
}
