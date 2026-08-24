import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';

import { db } from '../services/db.service';
import { issueToken } from '../services/token.service';
import { HttpError } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function publicUser(u: { id: string; name: string; kind: string; email: string | null }) {
  return { id: u.id, name: u.name, kind: u.kind, email: u.email };
}

/**
 * GET /api/auth/guest?name=YourName
 * The primary on-ramp: anyone joining a meeting gets a short-lived JWT.
 * Socket.IO handshakes and room join calls are authenticated with it.
 */
export async function guest(req: Request, res: Response): Promise<void> {
  // Accept name from query param (for GET) or body (for backward compat)
  const name =
    String(req.query?.name ?? req.body?.name ?? 'Guest').trim();
  if (!name || name.length > 64) throw new HttpError(400, 'A display name (≤64 chars) is required');

  const user = await db.createGuest(name);
  res.json({ token: issueToken({ sub: user.id, name: user.name, kind: 'guest' }), user: publicUser(user) });
}

/** POST /api/auth/register { name, email, password } */
export async function register(req: Request, res: Response): Promise<void> {
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!name) throw new HttpError(400, 'Name is required');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Valid email is required');
  if (password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Password must be ≥${MIN_PASSWORD_LENGTH} characters`);

  if (await db.findUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.createUser(name, email, passwordHash);
  res.status(201).json({ token: issueToken({ sub: user.id, name: user.name, kind: 'user' }), user: publicUser(user) });
}

/** POST /api/auth/login { email, password } */
export async function login(req: Request, res: Response): Promise<void> {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  const user = await db.findUserByEmail(email);
  if (!user?.passwordHash) throw new HttpError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid credentials');

  res.json({ token: issueToken({ sub: user.id, name: user.name, kind: 'user' }), user: publicUser(user) });
}
