import { randomBytes } from 'crypto';

import { db } from './db.service';
import type { StoredRoom } from './db.service';

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no easily-confused chars

function randomGroup(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return out;
}

/** Human-friendly room slug, e.g. "kwxq-7fap-2mht". */
export function generateSlug(): string {
  return `${randomGroup(4)}-${randomGroup(4)}-${randomGroup(4)}`;
}

/** LiveKit participant identity: stable-ish, unique per join. */
export function buildIdentity(displayName: string): string {
  const base =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'guest';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

/** Create a new room with a collision-checked slug. */
export async function createRoom(name: string, createdById?: string | null): Promise<StoredRoom> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = generateSlug();
    // eslint-disable-next-line no-await-in-loop
    const existing = await db.findRoomBySlug(slug);
    if (!existing) return db.createRoom({ slug, name, createdById });
  }
  throw new Error('Could not allocate a unique room slug');
}

/**
 * Ad-hoc join semantics: a room is created on demand the first time
 * someone joins its slug (matches the product spec).
 */
export async function getOrCreateRoom(slug: string, createdById?: string | null): Promise<StoredRoom> {
  const existing = await db.findRoomBySlug(slug);
  if (existing) return existing;
  return db.createRoom({ slug, name: slug, createdById });
}
