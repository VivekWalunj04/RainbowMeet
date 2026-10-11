import { getRedisClient } from '../config/redisClient';

type RedisClient = ReturnType<typeof import('redis').createClient>;

/**
 * Ephemeral room presence (who's in which Socket.IO room, hand-raise state).
 *
 * Source of truth is Redis so every backend instance sees the SAME global
 * member list for a room. This is what makes `presence:members` correct when
 * participants land on different EC2 instances:
 *
 *   - presence:room:{roomSlug}   HASH  socketId -> JSON(PresenceMember)
 *   - presence:socket:{socketId}  SET   roomSlugs the socket has joined
 *
 * When Redis is unavailable the service falls back to per-instance process
 * memory (single-instance deployments only).
 */

export interface PresenceMember {
  socketId: string;
  userId: string;
  name: string;
  raised: boolean;
  joinedAt: number;
}

const PRESENCE_PREFIX = 'presence:room:';
const SOCKET_PREFIX = 'presence:socket:';

// In-memory fallback (single-instance / no Redis)
const roomsMem = new Map<string, Map<string, PresenceMember>>();

/**
 * Run `redis` against the shared client; fall back to a synchronous in-memory
 * implementation when Redis is unavailable. The fallback is lazy — it only
 * runs when Redis is missing or errors.
 */
async function withClient<T>(redis: (client: RedisClient) => Promise<T>, mem: () => T): Promise<T> {
  const client = await getRedisClient();
  if (!client) return mem();
  try {
    return await redis(client);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[presence] redis error, falling back to memory:', (err as Error).message);
    return mem();
  }
}

export function addMember(roomSlug: string, member: PresenceMember): Promise<void> {
  return withClient(
    async (client) => {
      await client.hSet(`${PRESENCE_PREFIX}${roomSlug}`, member.socketId, JSON.stringify(member));
      await client.sAdd(`${SOCKET_PREFIX}${member.socketId}`, roomSlug);
    },
    () => {
      let members = roomsMem.get(roomSlug);
      if (!members) {
        members = new Map();
        roomsMem.set(roomSlug, members);
      }
      members.set(member.socketId, member);
    },
  );
}

export function removeMember(roomSlug: string, socketId: string): Promise<PresenceMember | null> {
  return withClient(
    async (client) => {
      const raw = await client.hGet(`${PRESENCE_PREFIX}${roomSlug}`, socketId);
      const member: PresenceMember | null = raw ? (JSON.parse(raw) as PresenceMember) : null;
      await client.hDel(`${PRESENCE_PREFIX}${roomSlug}`, socketId);
      await client.sRem(`${SOCKET_PREFIX}${socketId}`, roomSlug);
      // Clean up empty keys so dead rooms don't accumulate in Redis.
      const remaining = await client.hLen(`${PRESENCE_PREFIX}${roomSlug}`);
      if (remaining === 0) await client.del(`${PRESENCE_PREFIX}${roomSlug}`);
      const socketsLeft = await client.sCard(`${SOCKET_PREFIX}${socketId}`);
      if (socketsLeft === 0) await client.del(`${SOCKET_PREFIX}${socketId}`);
      return member;
    },
    () => {
      const members = roomsMem.get(roomSlug);
      if (!members) return null;
      const member = members.get(socketId) ?? null;
      members.delete(socketId);
      if (members.size === 0) roomsMem.delete(roomSlug);
      return member;
    },
  );
}

export function setRaised(roomSlug: string, socketId: string, raised: boolean): Promise<void> {
  return withClient(
    async (client) => {
      const raw = await client.hGet(`${PRESENCE_PREFIX}${roomSlug}`, socketId);
      if (!raw) return;
      const member = JSON.parse(raw) as PresenceMember;
      member.raised = raised;
      await client.hSet(`${PRESENCE_PREFIX}${roomSlug}`, socketId, JSON.stringify(member));
    },
    () => {
      const member = roomsMem.get(roomSlug)?.get(socketId);
      if (member) member.raised = raised;
    },
  );
}

export function getMembers(roomSlug: string): Promise<PresenceMember[]> {
  return withClient(
    async (client) => {
      const all = await client.hGetAll(`${PRESENCE_PREFIX}${roomSlug}`);
      const members = Object.values(all).map((raw) => JSON.parse(raw) as PresenceMember);
      return members.sort((a, b) => a.joinedAt - b.joinedAt);
    },
    () => [...(roomsMem.get(roomSlug)?.values() ?? [])].sort((a, b) => a.joinedAt - b.joinedAt),
  );
}

export function roomsOfSocket(socketId: string): Promise<string[]> {
  return withClient(
    async (client) => client.sMembers(`${SOCKET_PREFIX}${socketId}`),
    () => {
      const out: string[] = [];
      for (const [slug, members] of roomsMem) if (members.has(socketId)) out.push(slug);
      return out;
    },
  );
}