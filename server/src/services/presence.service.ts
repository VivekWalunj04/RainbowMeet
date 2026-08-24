/**
 * Ephemeral room presence (who's in which Socket.IO room, hand-raise state).
 *
 * Kept in process memory per instance; Socket.IO fan-out across instances is
 * handled by the Redis adapter (see config/redis.ts). Redis is used for
 * transport, not as source of truth — presence is rebuildable by nature.
 */

export interface PresenceMember {
  socketId: string;
  userId: string;
  name: string;
  raised: boolean;
  joinedAt: number;
}

const rooms = new Map<string, Map<string, PresenceMember>>();

export function addMember(roomSlug: string, member: PresenceMember): void {
  let members = rooms.get(roomSlug);
  if (!members) {
    members = new Map();
    rooms.set(roomSlug, members);
  }
  members.set(member.socketId, member);
}

export function removeMember(roomSlug: string, socketId: string): PresenceMember | null {
  const members = rooms.get(roomSlug);
  if (!members) return null;
  const member = members.get(socketId) ?? null;
  members.delete(socketId);
  if (members.size === 0) rooms.delete(roomSlug);
  return member;
}

export function setRaised(roomSlug: string, socketId: string, raised: boolean): void {
  const member = rooms.get(roomSlug)?.get(socketId);
  if (member) member.raised = raised;
}

export function getMembers(roomSlug: string): PresenceMember[] {
  return [...(rooms.get(roomSlug)?.values() ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
}

export function roomsOfSocket(socketId: string): string[] {
  const out: string[] = [];
  for (const [slug, members] of rooms) if (members.has(socketId)) out.push(slug);
  return out;
}
