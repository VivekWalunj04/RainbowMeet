import type { Server, Socket } from 'socket.io';

import * as presence from '../services/presence.service';

/**
 * Real-time presence events: raise/lower hand and participant leave
 * notifications. Join is handled in chat.socket.ts ('room:join') because it
 * also wires up the chat channel.
 */
export function registerPresenceHandlers(io: Server, socket: Socket): void {
  socket.on('presence:raise-hand', async (payload: { roomSlug?: string; raised?: boolean }) => {
    const roomSlug = String(payload?.roomSlug ?? socket.data.roomSlug ?? '');
    const raised = payload?.raised === true;
    if (!roomSlug || !socket.rooms.has(roomSlug)) return;

    await presence.setRaised(roomSlug, socket.id, raised);
    const name = socket.data.displayName ?? socket.data.user.name;

    io.to(roomSlug).emit('presence:raise-hand', { name, raised });
    io.to(roomSlug).emit('presence:members', await presence.getMembers(roomSlug));
  });

  socket.on('disconnecting', async () => {
    for (const roomSlug of await presence.roomsOfSocket(socket.id)) {
      const member = await presence.removeMember(roomSlug, socket.id);
      if (member) {
        socket.to(roomSlug).emit('presence:participant-left', { name: member.name });
        socket.to(roomSlug).emit('presence:members', await presence.getMembers(roomSlug));
      }
    }
  });
}
