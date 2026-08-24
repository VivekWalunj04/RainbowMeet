/* Production verification & health check script for NexMeet backend */
import { createClient } from '../server/node_modules/redis/dist/index.js';
import { AccessToken } from '../server/node_modules/livekit-server-sdk/dist/index.js';
import { db } from '../server/dist/services/db.service.js';
import { config } from '../server/dist/config/index.js';

const log = (...args) => console.log('[prod-check]', ...args);
const error = (...args) => console.error('[prod-check] ERROR:', ...args);

async function checkProductionConfig() {
  log('Starting NexMeet Production Environment Check...');
  log('--------------------------------------------------');
  log(`Environment:      ${config.env}`);
  log(`Port:             ${config.port}`);
  log(`CORS Client URL:  ${config.clientUrl}`);
  log(`Database Storage: ${config.inMemory ? 'In-Memory Mode' : 'PostgreSQL (Neon)'}`);

  let failed = false;

  // 1. Verify LiveKit Token Generation
  try {
    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: 'test-check-user',
      ttl: 60,
    });
    at.addGrant({ room: 'test-room', roomJoin: true });
    const jwt = await at.toJwt();
    if (!jwt || typeof jwt !== 'string') throw new Error('Generated token is invalid');
    log('✓ LiveKit AccessToken generation operational');
  } catch (err) {
    error('LiveKit Token Generation failed:', err.message);
    failed = true;
  }

  // 2. Verify Upstash Redis Connection (if configured)
  if (config.redisUrl) {
    try {
      const client = createClient({ url: config.redisUrl });
      client.on('error', (err) => error('Redis client error:', err.message));
      await client.connect();
      const pingRes = await client.ping();
      log(`✓ Upstash Redis connection operational (PING -> ${pingRes})`);
      await client.quit();
    } catch (err) {
      error('Upstash Redis connection failed:', err.message);
      failed = true;
    }
  } else {
    log('! REDIS_URL not configured (running in standalone mode)');
  }

  // 3. Verify Database Operations (Neon Postgres or In-Memory fallback)
  try {
    const testRoomSlug = `check-${Date.now()}`;
    const room = await db.createRoom({ slug: testRoomSlug, name: 'Production Check Room' });
    const fetched = await db.findRoomBySlug(testRoomSlug);
    if (!fetched || fetched.slug !== testRoomSlug) throw new Error('Database create/read mismatch');
    log(`✓ Database operational (${config.inMemory ? 'In-Memory' : 'Neon Postgres'}) - Created room: ${room.slug}`);
  } catch (err) {
    error('Database operations failed:', err.message);
    failed = true;
  } finally {
    await db.closeDatabase().catch(() => null);
  }

  log('--------------------------------------------------');
  if (failed) {
    error('Production check completed with errors.');
    process.exit(1);
  } else {
    log('All production health checks PASSED successfully! ✓');
    process.exit(0);
  }
}

checkProductionConfig().catch((err) => {
  error('Fatal error during production check:', err);
  process.exit(1);
});
