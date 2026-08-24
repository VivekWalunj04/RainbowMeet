import type { Server, Socket } from 'socket.io';

import { verifyToken } from '../services/token.service';
import { registerChatHandlers } from './chat.socket';
import { registerPresenceHandlers } from './presence.socket';

/**
 * Socket.IO bootstrap.
 *
 * Every connection must present a valid app JWT in the auth handshake:
 *   io(url, { auth: { token } })
 * Unauthenticated sockets are rejected before any handler runs.
 */
export function setupSockets(io: Server): void {
  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    registerChatHandlers(io, socket);
    registerPresenceHandlers(io, socket);
  });
}
