/* Distributed-system verification for NexMeet.
 *
 * Proves the multi-instance guarantees that matter for the EC2 deployment:
 *   1. GLOBAL PRESENCE  — a member who joins through backend-a appears in the
 *      member list broadcast by backend-b.
 *   2. CROSS-INSTANCE FANOUT — a chat message sent via backend-a arrives via
 *      a socket connected to backend-b (Socket.IO Redis adapter).
 *   3. GLOBAL HISTORY — new joiners get the full conversation regardless of
 *      which instance they land on (Redis-backed history, not per-process).
 *   4. LAMPORT CLOCK — messages issued on two instances get distinct,
 *      monotonically increasing timestamps (total order).
 *
 * Setup:  docker compose -f scripts/distributed-test/docker-compose.yml up -d --build
 * Usage:  node scripts/distributed-test/verify-distributed.mjs
 */
import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

const INSTANCE_A = process.env.INSTANCE_A || 'http://localhost:3100';
const INSTANCE_B = process.env.INSTANCE_B || 'http://localhost:3200';
const ROOM = 'distributed-demo-room';

let failures = 0;
const ok = (label, cond) => {
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}`);
  if (!cond) failures += 1;
};

async function guest(name, base) {
  const res = await fetch(`${base}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`guest auth failed on ${base}: ${JSON.stringify(body)}`);
  return body.token;
}

function connect(base, token) {
  return new Promise((resolve, reject) => {
    const s = io(base, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error(`timeout connecting to ${base}`)), 5000).unref();
  });
}

const listenFor = (socket, event, predicate, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event);
      reject(new Error(`timeout waiting for '${event}'`));
    }, timeoutMs);
    socket.on(event, (...args) => {
      if (!predicate || predicate(...args)) {
        clearTimeout(timer);
        socket.off(event);
        resolve(...args);
      }
    });
  });

const main = async () => {
  console.log('NexMeet distributed verification');
  console.log(`  instance A: ${INSTANCE_A}`);
  console.log(`  instance B: ${INSTANCE_B}`);
  console.log();

  const tokenA = await guest('AliceDistributed', INSTANCE_A);
  const tokenB = await guest('BobDistributed', INSTANCE_B);
  console.log('[setup] guest JWTs minted on both instances\n');

  const alice = await connect(INSTANCE_A, tokenA);
  const bob = await connect(INSTANCE_B, tokenB);
  console.log('[setup] alice -> backend-a, bob -> backend-b\n');

  // --- 1. GLOBAL PRESENCE --------------------------------------------
  // Alice joins first; wait until her own join is visible, then Bob joins on
  // the OTHER instance — both sockets must converge on the same 2-member list.
  const aliceSelf = listenFor(alice, 'presence:members', (ms) => ms.length >= 1);
  alice.emit('room:join', { roomSlug: ROOM, displayName: 'AliceDistributed' });
  await aliceSelf;

  const membersOnA = listenFor(alice, 'presence:members', (ms) => ms.length === 2);
  const membersOnB = listenFor(bob, 'presence:members', (ms) => ms.length === 2);
  bob.emit('room:join', { roomSlug: ROOM, displayName: 'BobDistributed' });
  const both = await Promise.all([membersOnA, membersOnB]);

  const namesA = both[0].map((m) => m.name).sort();
  const namesB = both[1].map((m) => m.name).sort();
  ok('global presence: both members visible via backend-a', namesA.join(',') === 'AliceDistributed,BobDistributed');
  ok('global presence: both members visible via backend-b', namesB.join(',') === 'AliceDistributed,BobDistributed');

  // --- 2. CROSS-INSTANCE CHAT FANOUT --------------------------------
  const bobReceives = listenFor(bob, 'chat:message', (m) => m.senderName === 'AliceDistributed');
  alice.emit('chat:message', { roomSlug: ROOM, text: 'hello from instance A' });
  const fromA = await bobReceives;

  const aliceReceives = listenFor(alice, 'chat:message', (m) => m.senderName === 'BobDistributed');
  bob.emit('chat:message', { roomSlug: ROOM, text: 'hi from instance B' });
  const fromB = await aliceReceives;

  ok('chat fanout: A->B (sent on backend-a, seen on backend-b)', fromA.text === 'hello from instance A');
  ok('chat fanout: B->A (sent on backend-b, seen on backend-a)', fromB.text === 'hi from instance B');

  // --- 3. LAMPORT CLOCK (total order) -------------------------------
  console.log(`  [info] lamport A→B = ${fromA.lamport}, B→A = ${fromB.lamport}`);
  ok('lamport: distinct values', fromA.lamport !== fromB.lamport);
  ok('lamport: monotonically increasing', fromA.lamport < fromB.lamport);
  ok('lamport: nodeId present on both', Boolean(fromA.nodeId) && Boolean(fromB.nodeId));

  // --- 4. GLOBAL HISTORY --------------------------------------------
  // Charlie joins via backend-b AFTER both messages existed; the history it
  // fetches must contain the message Alice wrote via backend-a.
  const tokenC = await guest('CharlieDistributed', INSTANCE_A);
  const charlie = await connect(INSTANCE_B, tokenC);
  const historyOnCharlie = listenFor(charlie, 'chat:history', (msgs) => msgs.length >= 2);
  charlie.emit('room:join', { roomSlug: ROOM, displayName: 'CharlieDistributed' });
  const history = await historyOnCharlie;
  const texts = history.map((m) => m.text);
  ok('global history: charlie (on backend-b) sees A and B messages', 
    texts.includes('hello from instance A') && texts.includes('hi from instance B'));
  // Ordered by lamport.
  const lamports = history.map((m) => m.lamport);
  ok('global history: client-side lamport order matches send order',
    lamports[0] < lamports[lamports.length - 1]);

  // Cleanup
  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();

  console.log();
  if (failures === 0) {
    console.log('ALL DISTRIBUTED-CHECKS PASSED');
    process.exit(0);
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('verification errored:', err.message);
  process.exit(1);
});