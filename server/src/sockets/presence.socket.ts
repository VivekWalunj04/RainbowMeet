import type { Server, Socket } from 'socket.io';

import * as presence from '../services/presence.service';

/**
 * Real-time presence events: raise/lower hand and participant leave
 * notifications. Join is handled in chat.socket.ts ('room:join') because it
 * also wires up the chat channel.
 */
export function registerPresenceHandlers(io: Server, socket: Socket): void {
  socket.on('presence:raise-hand', (payload: { roomSlug?: string; raised?: boolean }) => {
    const roomSlug = String(payload?.roomSlug ?? socket.data.roomSlug ?? '');
    const raised = payload?.raised === true;
    if (!roomSlug || !socket.rooms.has(roomSlug)) return;

    presence.setRaised(roomSlug, socket.id, raised);
    const name = socket.data.displayName ?? socket.data.user.name;

    io.to(roomSlug).emit('presence:raise-hand', { name, raised });
    io.to(roomSlug).emit('presence:members', presence.getMembers(roomSlug));
  });

  socket.on('disconnecting', () => {
    for (const roomSlug of presence.roomsOfSocket(socket.id)) {
      const member = presence.removeMember(roomSlug, socket.id);
      if (member) {
        socket.to(roomSlug).emit('presence:participant-left', { name: member.name });
        socket.to(roomSlug).emit('presence:members', presence.getMembers(roomSlug));
      }
    }
  });
}
