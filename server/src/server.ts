import http from 'http';

import { Server } from 'socket.io';

import { createApp } from './app';
import { assertProductionSecrets, config } from './config';
import { setupRedisAdapter } from './config/redis';
import { setupSockets } from './sockets';

import { db } from './services/db.service';

async function main(): Promise<void> {
  assertProductionSecrets();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Socket.IO rides the same HTTP server; CORS mirrors the REST allowlist.
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Long timeouts: meeting sockets are long-lived
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  await setupRedisAdapter(io);
  setupSockets(io);

  httpServer.listen(config.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║  NexMeet server ready                            ║
  ║  REST + Socket.IO : http://0.0.0.0:${String(config.port).padEnd(5)}          ║
  ║  LiveKit SFU      : ${config.livekit.wsUrl.padEnd(28)}║
  ║  Storage          : ${(config.inMemory ? 'in-memory (dev)' : 'postgres + redis').padEnd(28)}║
  ╚══════════════════════════════════════════════════╝
`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[server] ${signal} received, shutting down…`);
    io.close();
    await db.closeDatabase().catch(() => null);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
