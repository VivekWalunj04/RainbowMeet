import { createClient } from 'redis';

import { config } from './index';

/**
 * Shared Redis client (singleton).
 *
 * Used for BOTH:
 *   - the Socket.IO cluster adapter (config/redis.ts)
 *   - application state that must be global across instances:
 *     room presence + chat history + the Lamport logical clock.
 *
 * Lazily connects on first use and settles to `null` when Redis is not
 * configured (or unreachable) so the server continues as a single instance
 * with in-memory state.
 */
type RedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<RedisClient | null> | null = null;

export function getRedisClient(): Promise<RedisClient | null> {
  if (!config.redisUrl || config.inMemory) {
    return Promise.resolve(null);
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createClient({ url: config.redisUrl });

      client.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error('[redis] client error:', (err as Error).message);
      });

      try {
        await client.connect();
        // eslint-disable-next-line no-console
        console.log('[redis] connected');
        return client;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[redis] unavailable, continuing with in-memory state:', (err as Error).message);
        await client.disconnect().catch(() => undefined);
        return null;
      }
    })();
  }

  return clientPromise;
}