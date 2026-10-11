import { randomBytes } from 'crypto';
import type { Server, Socket } from 'socket.io';

import type { ChatMessage } from '../types';
import * as presence from '../services/presence.service';
import * as chatHistory from '../services/chat.history.service';

const MAX_MESSAGE_LENGTH = 1000;

// Simple sliding-window rate limiter: max 6 messages / 3s per socket.
// Per-instance by design — it bounds a single connection, not aggregate load.
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

export function registerChatHandlers(io: Server, socket: Socket): void {
  /**
   * Join a chat room channel. The socket only receives events for rooms it
   * explicitly joins. Mirrors the LiveKit room slug 1:1.
   */
  socket.on('room:join', async (payload: { roomSlug?: string; displayName?: string }) => {
    const roomSlug = String(payload?.roomSlug ?? '').trim();
    const displayName = String(payload?.displayName ?? socket.data.user?.name ?? 'Guest').trim().slice(0, 64);
    if (!roomSlug || roomSlug.length > 80) return;

    void socket.join(roomSlug);
    socket.data.roomSlug = roomSlug;
    socket.data.displayName = displayName;

    await presence.addMember(roomSlug, {
      socketId: socket.id,
      userId: socket.data.user.sub,
      name: displayName,
      raised: false,
      joinedAt: Date.now(),
    });

    socket.to(roomSlug).emit('presence:participant-joined', { name: displayName });
    io.to(roomSlug).emit('presence:members', await presence.getMembers(roomSlug));
    socket.emit('chat:history', await chatHistory.getHistory(roomSlug));
  });

  /**
   * Structured in-meeting chat. Validated, rate-limited, enriched with
   * sender/timestamp server-side, stamped with a Lamport clock for total
   * cross-instance ordering, persisted to shared history, and broadcast to
   * everyone in the room (sender included, for echo).
   */
  socket.on('chat:message', async (payload: { roomSlug?: string; text?: string }) => {
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
      lamport: await chatHistory.nextLamport(roomSlug),
      nodeId: chatHistory.nodeId,
    };

    await chatHistory.pushMessage(msg);
    io.to(roomSlug).emit('chat:message', msg);
  });

  socket.on('disconnect', () => {
    sendLog.delete(socket.id);
  });
}
