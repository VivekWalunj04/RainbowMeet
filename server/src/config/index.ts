import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized configuration. Every env var is read once, here.
 *
 * Security note: LiveKit API credentials live ONLY here on the server.
 * The client receives short-lived, room-scoped tokens minted by
 * services/livekit.service.ts — never the API secret itself.
 */
export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  /** Comma-separated CORS allowlist */
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',

  /** App-level JWT (guest sessions, REST auth, Socket.IO handshake) */
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me',
  jwtTtlSeconds: 4 * 60 * 60, // 4h app sessions

  livekit: {
    apiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? 'secret',
    wsUrl: process.env.LIVEKIT_WS_URL ?? 'ws://localhost:7880',
    /** LiveKit room tokens expire 2 hours after issue */
    roomTokenTtlSeconds: 2 * 60 * 60,
  },

  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,

  /**
   * When true, the app runs without Postgres/Redis using process memory.
   * Enabled explicitly via IN_MEMORY_STORE=true or implicitly when no
   * DATABASE_URL is set. docker-compose overrides this to false.
   */
  inMemory: process.env.IN_MEMORY_STORE === 'true' || !process.env.DATABASE_URL,
} as const;

export function assertProductionSecrets(): void {
  if (config.env !== 'production') return;
  const weak: string[] = [];
  if (config.jwtSecret.includes('change-me') || config.jwtSecret.includes('dev-only')) weak.push('JWT_SECRET');
  if (config.livekit.apiSecret === 'secret' || config.livekit.apiKey === 'devkey') weak.push('LIVEKIT_API_KEY/SECRET');
  if (!config.databaseUrl) weak.push('DATABASE_URL (PostgreSQL / Neon)');
  if (!config.redisUrl) weak.push('REDIS_URL (Upstash / Redis)');

  if (weak.length) {
    // eslint-disable-next-line no-console
    console.warn(`[config] WARNING: Missing or default production configuration: ${weak.join(', ')}`);
  }
}
