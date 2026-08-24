import { randomBytes } from 'crypto';
import type { Server, Socket } from 'socket.io';

import type { ChatMessage } from '../types';
import * as presence from '../services/presence.service';

const MAX_MESSAGE_LENGTH = 1000;
const HISTORY_LIMIT = 200;

// Per-room recent history (in-memory ring; swap for Postgres persistence later)
const histories = new Map<string, ChatMessage[]>();

// Simple sliding-window rate limiter: max 6 messages / 3s per socket
const RATE_WINDOW_MS = 3000;
const RATE_MAX = 6;
const sendLog = new Map<string, number[]>();

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const log = (sendLog.get(socketId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  sendLog.set(socketId, log);
  if (log.length >= RATE_MAX) return true;
  log.push(now);
  return false;
}

function pushHistory(msg: ChatMessage): void {
  const list = histories.get(msg.roomSlug) ?? [];
  list.push(msg);
  if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
  histories.set(msg.roomSlug, list);
}

export function registerChatHandlers(io: Server, socket: Socket): void {
  /**
   * Join a chat room channel. The socket only receives events for rooms it
   * explicitly joins. Mirrors the LiveKit room slug 1:1.
   */
  socket.on('room:join', (payload: { roomSlug?: string; displayName?: string }) => {
    const roomSlug = String(payload?.roomSlug ?? '').trim();
    const displayName = String(payload?.displayName ?? socket.data.user?.name ?? 'Guest').trim().slice(0, 64);
    if (!roomSlug || roomSlug.length > 80) return;

    void socket.join(roomSlug);
    socket.data.roomSlug = roomSlug;
    socket.data.displayName = displayName;

    presence.addMember(roomSlug, {
      socketId: socket.id,
      userId: socket.data.user.sub,
      name: displayName,
      raised: false,
      joinedAt: Date.now(),
    });

    socket.to(roomSlug).emit('presence:participant-joined', { name: displayName });
    io.to(roomSlug).emit('presence:members', presence.getMembers(roomSlug));
    socket.emit('chat:history', histories.get(roomSlug) ?? []);
  });

  /**
   * Structured in-meeting chat. Validated, rate-limited, enriched with
   * sender/timestamp server-side, persisted to per-room history, and
   * broadcast to everyone in the room (sender included, for echo).
   */
  socket.on('chat:message', (payload: { roomSlug?: string; text?: string }) => {
    const roomSlug = String(payload?.roomSlug ?? socket.data.roomSlug ?? '');
    const text = String(payload?.text ?? '').trim();

    if (!roomSlug || !socket.rooms.has(roomSlug)) return;
    if (!text || text.length > MAX_MESSAGE_LENGTH) return;
    if (isRateLimited(socket.id)) {
      socket.emit('chat:rate-limited', { retryAfterMs: RATE_WINDOW_MS });
      return;
    }

    const msg: ChatMessage = {
      id: randomBytes(8).toString('hex'),
      roomSlug,
      senderId: socket.data.user.sub,
      senderName: socket.data.displayName ?? socket.data.user.name,
      text,
      timestamp: Date.now(),
    };

    pushHistory(msg);
    io.to(roomSlug).emit('chat:message', msg);
  });

  socket.on('disconnect', () => {
    sendLog.delete(socket.id);
  });
}
