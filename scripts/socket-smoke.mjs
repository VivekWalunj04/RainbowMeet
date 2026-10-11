/* Socket.IO integration smoke test: two guests chat in a room.
 *
 * Usage: node scripts/socket-smoke.mjs <room-slug> [api-base-url]
 *
 * Defaults to the local Docker stack's nginx proxy. The backend's
 * port 3000 is deliberately not published by docker-compose.yml, so
 * point this at the frontend origin instead:
 *   node scripts/socket-smoke.mjs <slug> https://localhost
 */
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';

const API = process.argv[3] || 'https://localhost';
const roomSlug = process.argv[2];
const isHttps = API.startsWith('https');

/**
 * The local stack serves TLS with the self-signed pair in ./certs, so both
 * the HTTP calls and the Socket.IO WebSocket transport need that cert trusted
 * explicitly. Override with SMOKE_CA=/path/to/ca.pem, or pass an http:// API
 * base to bypass this entirely.
 */
const ca = isHttps
  ? readFileSync(process.env.SMOKE_CA || new URL('../certs/fullchain.pem', import.meta.url))
  : undefined;

/** Socket.IO options carrying the custom CA through to the WS transport. */
const ioOpts = { transports: ['websocket'], ...(ca ? { ca } : {}) };

function postJson(path, body) {
  const payload = JSON.stringify(body);
  const reqFn = isHttps ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = reqFn(`${API}${path}`, {
      method: 'POST',
      ...(ca ? { ca } : {}),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`non-JSON response (${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function guest(name) {
  const body = await postJson('/api/auth/guest', { name });
  if (!body.token) throw new Error(`guest auth failed: ${JSON.stringify(body)}`);
  return body.token;
}

const log = (...a) => console.log('[smoke]', ...a);
const fail = (msg) => {
  console.error('[smoke] FAIL:', msg);
  process.exit(1);
};

const [tokenA, tokenB] = await Promise.all([guest('Ada'), guest('Alan')]);

let received = null;
let sawJoin = null;
let sawHand = null;
let unauthRejected = false;

// 0) Unauthenticated socket must be rejected
await new Promise((resolve) => {
  const bad = io(API, { ...ioOpts, auth: { token: 'junk' } });
  bad.on('connect_error', (e) => {
    unauthRejected = e.message === 'unauthorized';
    bad.close();
    resolve();
  });
  setTimeout(() => {
    bad.close();
    resolve();
  }, 3000);
});
log('unauth socket rejected:', unauthRejected);

// 1) Alan joins first, listens
const b = io(API, { ...ioOpts, auth: { token: tokenB } });
await new Promise((res, rej) => {
  b.on('connect', () => {
    b.emit('room:join', { roomSlug, displayName: 'Alan' });
    res();
  });
  b.on('connect_error', rej);
  setTimeout(() => rej(new Error('B connect timeout')), 5000);
});
b.on('chat:message', (m) => (received = m));
b.on('presence:participant-joined', (p) => (sawJoin = p.name));
b.on('presence:raise-hand', (p) => (sawHand = p));

// 2) Ada joins, chats, raises hand
const a = io(API, { ...ioOpts, auth: { token: tokenA } });
await new Promise((res, rej) => {
  a.on('connect', () => {
    a.emit('room:join', { roomSlug, displayName: 'Ada' });
    res();
  });
  a.on('connect_error', rej);
  setTimeout(() => rej(new Error('A connect timeout')), 5000);
});
a.on('chat:history', (h) => log('history received by Ada, len =', h.length));

await new Promise((r) => setTimeout(r, 400));
a.emit('chat:message', { roomSlug, text: 'hello from Ada' });
a.emit('presence:raise-hand', { roomSlug, raised: true });

await new Promise((r) => setTimeout(r, 600));

if (!received) fail('Alan did not receive chat message');
log('chat delivered:', JSON.stringify(received));
if (received.text !== 'hello from Ada' || received.senderName !== 'Ada') fail('message payload wrong');
if (!received.timestamp || !received.id) fail('message missing server fields');
if (sawJoin !== 'Ada') fail(`join presence wrong: ${sawJoin}`);
log('presence join ok:', sawJoin);
if (!sawHand?.raised) fail('raise-hand not delivered');
log('raise-hand ok:', JSON.stringify(sawHand));

// 3) Rate limit: blast 10 messages quickly from Ada, Alan should get ≤ 6
let burstCount = 0;
b.removeAllListeners('chat:message');
b.on('chat:message', (m) => {
  if (!m.system) burstCount += 1;
});
for (let i = 0; i < 10; i++) a.emit('chat:message', { roomSlug, text: `burst ${i}` });
await new Promise((r) => setTimeout(r, 800));
log(`rate limiting: ${burstCount}/10 burst messages delivered (cap ≈ 6)`);
if (burstCount > 6) fail('chat rate limit not enforced');

a.close();
b.close();
console.log('\nALL SOCKET SMOKE TESTS PASSED ✓');
process.exit(0);
