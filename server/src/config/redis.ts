import { createAdapter } from '@socket.io/redis-adapter';
import type { Server } from 'socket.io';

import { getRedisClient } from './redisClient';

/**
 * Attach the Socket.IO Redis adapter so chat/presence events fan out across
 * multiple backend instances. Optional: if Redis is unreachable the server
 * continues standalone (single-instance deployments don't need it).
 *
 * Reuses the shared client from config/redisClient.ts as the pub client and
 * derives a private subscriber from it.
 */
export async function setupRedisAdapter(io: Server): Promise<void> {
  const pubClient = await getRedisClient();
  if (!pubClient) return;

  try {
    const subClient = pubClient.duplicate();

    subClient.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] Sub client error:', (err as Error).message);
    });

    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    // eslint-disable-next-line no-console
    console.log('[redis] Socket.IO Redis adapter connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[redis] unavailable, continuing without adapter:', (err as Error).message);
  }
}