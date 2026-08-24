import type { Request, Response } from 'express';

import { createRoom, getOrCreateRoom, buildIdentity } from '../services/room.service';
import { generateLivekitToken } from '../services/livekit.service';
import { db } from '../services/db.service';
import { HttpError } from '../types';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,64}$/;

function publicRoom(r: { slug: string; name: string; createdAt: Date; isActive: boolean }) {
  return { slug: r.slug, name: r.name, createdAt: r.createdAt, isActive: r.isActive };
}

/** POST /api/rooms { title? } → create a room, get back its shareable slug. */
export async function create(req: Request, res: Response): Promise<void> {
  const title = String(req.body?.title ?? '').trim().slice(0, 120) || 'NexMeet Meeting';
  const room = await createRoom(title, req.user?.sub ?? null);
  res.status(201).json({ room: publicRoom(room) });
}

/** GET /api/rooms → recent rooms (useful for dashboards; capped at 50). */
export async function list(_req: Request, res: Response): Promise<void> {
  const rooms = await db.listRooms();
  res.json({ rooms: rooms.map(publicRoom) });
}

/** GET /api/rooms/:slug → room metadata (used by the pre-join screen). */
export async function getBySlug(req: Request, res: Response): Promise<void> {
  const slug = String(req.params.slug);
  const room = await db.findRoomBySlug(slug);
  if (!room) throw new HttpError(404, 'Room not found');
  res.json({ room: publicRoom(room) });
}

/**
 * POST /api/rooms/:slug/join { displayName }
 *
 * 1. Resolve the room (ad-hoc create if missing — spec behavior)
 * 2. Mint a LiveKit access token for a fresh participant identity
 * 3. Return { token, wsUrl, identity, room } — the client connects straight
 *    to the SFU; media never touches this server.
 */
export async function join(req: Request, res: Response): Promise<void> {
  const slug = String(req.params.slug);
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Invalid room slug');

  const displayName = String(req.body?.displayName ?? req.user?.name ?? '').trim();
  if (!displayName || displayName.length > 64) throw new HttpError(400, 'displayName (≤64 chars) is required');

  const room = await getOrCreateRoom(slug, req.user?.sub ?? null);
  const identity = buildIdentity(displayName);

  const { token, wsUrl } = await generateLivekitToken(room.slug, displayName, identity);

  res.json({ token, wsUrl, identity, room: publicRoom(room) });
}
