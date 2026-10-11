import { randomBytes } from 'crypto';

import { getRedisClient } from '../config/redisClient';
import type { ChatMessage } from '../types';

type RedisClient = ReturnType<typeof import('redis').createClient>;

/**
 * Chat history + Lamport logical clock.
 *
 * History is stored in Redis (a per-room LIST) so all backend instances serve
 * the same snapshot to late joiners:
 *
 *   - chat:history:{roomSlug}  LIST  JSON(ChatMessage), newest on the right
 *   - chat:lamport:{roomSlug}  STRING  Lamport clock value (last issued)
 *
 * Lamport timestamps give a total order across instances. Every message is
 * stamped with the clock value read via an atomic INCR, so two messages sent
 * on different EC2 instances still order deterministically. Clients sort by
 * (lamport, timestamp, id) to render a consistent stream.
 *
 * Falls back to per-instance memory when Redis is unavailable.
 */
interface HistoryStore {
  push(msg: ChatMessage): void;
  list(): ChatMessage[];
  nextLamport(): number;
}

const HISTORY_PREFIX = 'chat:history:';
const LAMPORT_PREFIX = 'chat:lamport:';
const HISTORY_LIMIT = 200;

// In-memory fallback (single-instance / no Redis)
const historiesMem = new Map<string, ChatMessage[]>();
const lamportMem = new Map<string, number>();

function memoryStore(roomSlug: string): HistoryStore {
  return {
    push(msg) {
      const list = historiesMem.get(roomSlug) ?? [];
      list.push(msg);
      if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
      historiesMem.set(roomSlug, list);
    },
    list() {
      return historiesMem.get(roomSlug) ?? [];
    },
    nextLamport() {
      const next = (lamportMem.get(roomSlug) ?? 0) + 1;
      lamportMem.set(roomSlug, next);
      return next;
    },
  };
}

/** JSON-encode a message once so Redis stores the same string everywhere. */
function encode(msg: ChatMessage): string {
  return JSON.stringify(msg);
}

export async function pushMessage(msg: ChatMessage): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    memoryStore(msg.roomSlug).push(msg);
    return;
  }
  try {
    await pushRedis(client, msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[chat] redis push failed, falling back to memory:', (err as Error).message);
    memoryStore(msg.roomSlug).push(msg);
  }
}

async function pushRedis(client: RedisClient, msg: ChatMessage): Promise<void> {
  const key = `${HISTORY_PREFIX}${msg.roomSlug}`;
  const multi = client.multi();
  multi.rPush(key, encode(msg));
  multi.lTrim(key, -HISTORY_LIMIT, -1); // keep the last HISTORY_LIMIT entries
  await multi.exec();
}

export async function getHistory(roomSlug: string): Promise<ChatMessage[]> {
  const client = await getRedisClient();
  if (!client) return memoryStore(roomSlug).list();
  try {
    const raw = await client.lRange(`${HISTORY_PREFIX}${roomSlug}`, 0, -1);
    return raw.map((entry) => JSON.parse(entry) as ChatMessage);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[chat] redis read failed, falling back to memory:', (err as Error).message);
    return memoryStore(roomSlug).list();
  }
}

/**
 * Issue the next Lamport timestamp for a room. Uses an atomic INCR against a
 * distributed key so the sequence is unique and monotonic across instances.
 */
export async function nextLamport(roomSlug: string): Promise<number> {
  const client = await getRedisClient();
  if (!client) return memoryStore(roomSlug).nextLamport();
  try {
    return await client.incr(`${LAMPORT_PREFIX}${roomSlug}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[chat] lamport INCR failed, falling back to memory:', (err as Error).message);
    return memoryStore(roomSlug).nextLamport();
  }
}

/** Stable process id — part of the message fingerprint for tie-breaking. */
export const nodeId = randomBytes(3).toString('hex');