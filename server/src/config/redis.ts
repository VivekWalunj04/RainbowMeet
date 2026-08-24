import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server } from 'socket.io';

import { config } from './index';

/**
 * Attach the Socket.IO Redis adapter so chat/presence events fan out across
 * multiple backend instances. Optional: if Redis is unreachable the server
 * continues standalone (single-instance deployments don't need it).
 */
export async function setupRedisAdapter(io: Server): Promise<void> {
  if (!config.redisUrl || config.inMemory) return;

  try {
    const pubClient = createClient({
      url: config.redisUrl,
      pingInterval: 30000,
    });

    pubClient.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] Pub client error:', (err as Error).message);
    });

    const subClient = pubClient.duplicate();

    subClient.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] Sub client error:', (err as Error).message);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    // eslint-disable-next-line no-console
    console.log('[redis] Socket.IO Redis adapter connected (Upstash / Redis)');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[redis] unavailable, continuing without adapter:', (err as Error).message);
  }
}
