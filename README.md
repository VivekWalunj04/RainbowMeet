# NexMeet

Browser-based video conferencing for small teams (4–5 participants per room), built
on a **SFU architecture with LiveKit** — not mesh/P2P. One link, instant meetings:
video, audio, screen share, live chat, and presence.

> **Do not** build a custom signaling server — LiveKit handles the SFU *and* the
> signaling. The backend's only media job is minting room-scoped access tokens.

---

## ✨ Features

**MVP**
- Create a room → get a shareable link (`/room/xxxx-yyyy-zzzz`)
- Join via link/code with a display name — no account required
- A/V for 4–5 participants via LiveKit SFU (adaptive stream + dynacast)
- Mute/unmute, camera on/off (avatar with initials when camera is off)
- Screen sharing (stage + filmstrip layout)
- Real-time in-meeting chat over Socket.IO (history, rate limiting)
- Participant list with live mic/camera status
- Per-tile connection-quality indicator (excellent/good/poor)
- Responsive grid that auto-arranges 1–5 tiles
- Pre-join lobby with live device preview

**Post-MVP (included)**
- Raise hand (badges on tiles + roster)
- Active-speaker highlight + speaker layout toggle
- Auto-hiding controls bar (5s idle fade)
- Copy-invite-link button, meeting timer
- Switch camera/mic/speaker mid-call
- Leave screen with rejoin flow

**Roadmap:** recording (LiveKit Egress), virtual backgrounds, E2EE via Insertable
Streams, persisted chat, mobile layout refinements.

---

## 🏛 Architecture

```
                      ┌──────────────────────────────────────────────┐
                      │                   Nginx (443)                │
                      │  /            → SPA (React build)            │
                      │  /api         → NexMeet-server (Express)    │
                      │  /socket.io   → NexMeet-server (Socket.IO)  │
                      │  /livekit     → LiveKit SFU (WS signaling)   │
                      └───────┬───────────────┬───────────┬──────────┘
                              │               │           │
                        static SPA       REST + WS        WS
                                              │           │
        Browser ────── HTTPS/WSS ─────────────┤           │
            │                                 ▼           ▼
            │                        ┌───────────────┐  ┌──────────────────┐
            │  1. POST /auth/guest   │  NexMeet-    │  │ LiveKit SFU      │
            │  2. POST /rooms/:id/   │  server       │  │ (:7880 WS, UDP   │
            │     join → {token}     │  (Express)    │  │  50000+, TCP     │
            │                        │               │  │  :7881 fallback) │
            │                        │  · JWT auth   │  └───────┬──────────┘
            │                        │  · token mint │          │ TURN 5349
            │                        │  · rate limit │  ┌───────▼──────────┐
            │                        │  · Socket.IO  │  │ coturn           │
            │                        └──────┬────────┘  └──────────────────┘
            │                               │
            │                        ┌──────▼─────┐   ┌───────────┐
            │                        │ PostgreSQL │   │ Redis     │
            │                        │ (users,    │   │ (Socket.IO│
            │                        │  rooms)    │   │  adapter) │
            │                        └────────────┘   └───────────┘
            │
            └── 3. WSS connect to SFU with token; media flows peer ⇄ SFU
                   (DTLS-SRTP over UDP 50000+, TCP 7881, or TURN 5349)
```

**Key flows**

1. **Join** — client asks the backend for credentials; backend validates the app JWT,
   upserts the room (ad-hoc create), and mints a **2-hour LiveKit access token**
   (`identity`, `room`, `canPublish/Subscribe/PublishData`). The API secret never
   leaves the server.
2. **Media** — the client connects straight to the SFU (`serverUrl`). Each participant
   publishes one camera/mic/screen stream and subscribes to everyone else's:
   4 participants ⇒ 4 up / ~12 down per room — this is why SFU beats mesh here.
3. **Chat & presence** — a parallel Socket.IO channel (JWT-authenticated handshake)
   carries structured chat (validated, rate-limited, history) and raise-hand /
   join-leave events.

---

## 🚀 Quickstart

### A. Local development (recommended first run)

**Prerequisites:** Node 20+. No database needed for the first run (in-memory mode).

```bash
# 1) Start a local LiveKit SFU (dev keys: devkey/secret)
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev
#    …or download the binary: https://github.com/livekit/livekit/releases
#    and run `./livekit-server --dev`

# 2) Backend  ── http://localhost:3000
cd server
cp .env.example .env            # defaults already work (devkey/secret, IN_MEMORY_STORE=true)
npm install
npm run dev

# 3) Frontend ── http://localhost:5173
cd ../client
npm install
npm run dev
```

Open **two** browser windows at `http://localhost:5173`, start a meeting in one,
paste the invite link in the other → you should see/hear yourself both ways.

> Using **LiveKit Cloud** instead? Skip the local SFU; set `LIVEKIT_API_KEY`,
> `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL=wss://<project>.livekit.cloud` in `server/.env`.
>
> Deploying to the cloud (Vercel + Render/AWS + EC2 SFU + Neon + Upstash)?
> See **[DEPLOY.md](./DEPLOY.md)**.

### B. Full stack with Docker (self-hosted, single VM)

```bash
cp .env.example .env      # then fill in: JWT_SECRET, LIVEKIT_API_KEY/SECRET,
                          # POSTGRES_PASSWORD (+DATABASE_URL), TURN_SECRET
docker compose up --build -d
```

**TLS is automatic.** The frontend container checks `./certs/` at startup:
- `fullchain.pem` + `privkey.pem` present → serves HTTPS on 443 and redirects
  port 80 (WebRTC requires a secure context).
- No certs → HTTP only (localhost testing).

For local testing a self-signed localhost pair is already generated in
`./certs/`. For a real domain use Let's Encrypt:

```bash
docker compose stop frontend   # free ports 80/443
docker run --rm -p 80:80 -v "${PWD}/certs:/etc/letsencrypt" \
  certbot/certbot certonly --standalone -d meet.example.com
cp certs/live/meet.example.com/fullchain.pem certs/live/meet.example.com/privkey.pem ./certs/
# then set CLIENT_URL=https://meet.example.com in .env and:
docker compose up -d frontend
```

**Deploying to a public VM — checklist:**
1. Rotate every secret in `.env` (never ship the committed dev values).
2. Set `CLIENT_URL=https://your-domain` (CORS allowlist).
3. In `livekit.yaml` set `rtc.use_external_ip: true`.
4. In `turnserver.conf` uncomment `external-ip=<public-ip>` and realm.
5. Firewall: open **80/443 TCP**, **7880 TCP** (signaling), **7881 TCP**
   (ICE fallback), **50000–50100 UDP** (media), **3478 TCP+UDP** (TURN;
   add **5349** if you enable TURN TLS).
6. Do not publish Postgres/Redis ports — compose keeps them internal-only.
7. First boot runs `prisma migrate deploy` automatically (migrations live in
   `server/src/prisma/migrations`).

---

## 🔑 Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | server | HTTP listen port (default 3000) |
| `CLIENT_URL` | server | CORS + Socket.IO origin allowlist (comma-separated) |
| `JWT_SECRET` | server | Signs app-level JWTs (guest sessions, socket handshake) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | server + livekit.yaml | SFU credentials — **server-side only** |
| `LIVEKIT_WS_URL` | server | Browser-facing SFU WebSocket URL returned to clients |
| `DATABASE_URL` | server | Postgres DSN used by Prisma |
| `REDIS_URL` | server | Enables the Socket.IO Redis adapter |
| `IN_MEMORY_STORE` | server | `true` = run without Postgres/Redis (dev/demo) |
| `TURN_DOMAIN` / `TURN_SECRET` | compose | coturn / LiveKit TURN integration |
| `VITE_API_URL` / `VITE_SOCKET_URL` | client | Only for split-origin setups; same-origin proxy is the default |

---

## 🌐 REST API

Base URL: `/api`. All routes except `GET /api/health` and `/api/auth/*` require
`Authorization: Bearer <app-jwt>`.

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `GET /api/health` | — | `{ ok, uptime, storage }` | public, for LB checks |
| `POST /api/auth/guest` | `{ name }` | `{ token, user }` | 50 req / 15 min / IP |
| `POST /api/auth/register` | `{ name, email, password }` | `{ token, user }` | bcrypt-hashed |
| `POST /api/auth/login` | `{ email, password }` | `{ token, user }` | |
| `POST /api/rooms` | `{ title? }` | `{ room }` | slug like `kwxq-7fap-2mht` |
| `GET /api/rooms` | — | `{ rooms[] }` | latest 50 |
| `GET /api/rooms/:slug` | — | `{ room }` | pre-join title lookup |
| `POST /api/rooms/:slug/join` | `{ displayName }` | `{ token, wsUrl, identity, room }` | mints LiveKit token; 60 req / 10 min / IP |

## 🔌 Socket.IO events

Connect with `io(url, { auth: { token } })` — unauthenticated sockets are rejected.

| Event | Direction | Payload |
|---|---|---|
| `room:join` | client → server | `{ roomSlug, displayName }` |
| `chat:message` | both | `{ roomSlug, text }` / `{ id, senderName, text, timestamp, … }` (≤1000 chars, 6 msg / 3 s) |
| `chat:history` | server → client | `ChatMessage[]` (last 200 on join) |
| `chat:rate-limited` | server → client | `{ retryAfterMs }` |
| `presence:raise-hand` | both | `{ roomSlug, raised }` / `{ name, raised }` |
| `presence:participant-joined` / `-left` | server → client | `{ name }` |
| `presence:members` | server → client | roster with hand state |

---

## 🔒 Security checklist

- [x] LiveKit tokens minted **server-side only**; API secret never shipped to the client
- [x] Room tokens expire after **2 hours**; app JWTs after 4 hours
- [x] Every API route (except health/auth) requires a valid JWT; Socket.IO requires a JWT handshake
- [x] CORS restricted to `CLIENT_URL`; Helmet security headers
- [x] Rate limiting: global API, stricter on `/auth/*` and `/rooms/:slug/join`, sliding-window on chat
- [x] Input validation & length caps on auth/join/chat payloads
- [x] HTTPS/WSS in production (Nginx template in `client/nginx.conf`) — WebRTC requires secure contexts

---

## 🧪 Testing

**Automated smoke tests** (used during development, all passing):

```bash
cd server && npm run typecheck && npm run build
cd ../client && npm run typecheck && npm run build

# with the backend running (IN_MEMORY_STORE=true):
node scripts/socket-smoke.mjs <room-slug>   # chat, presence, auth-reject, rate limit
```

**Manual checklist** (see also the original brief):

- [ ] 2 users see + hear each other
- [ ] 5 users join; all tiles render in the grid
- [ ] Mute/camera toggles reflect in tiles + participant list
- [ ] Camera off → initials avatar
- [ ] Screen share takes the stage; everyone sees it
- [ ] Chat appears in real time for all
- [ ] Leave updates the roster for others
- [ ] Kill Wi-Fi → "Reconnecting…" badge → media resumes
- [ ] Chrome / Firefox / Safari, desktop & mobile

---

## 📁 Structure

```
NexMeet/
├── client/            # React 18 + TS + Vite + Tailwind + Zustand
│   └── src/{components,hooks,store,pages,lib}
├── server/            # Express + TS + Socket.IO + Prisma + Redis
│   └── src/{routes,controllers,services,sockets,middleware,config,prisma}
├── docker-compose.yml # livekit + coturn + redis + postgres + server + client(nginx)
├── livekit.yaml       # SFU config (7880/7881, UDP 50000+, TURN)
├── turnserver.conf    # coturn relay
└── .env.example
```

---

## ⚠️ Notes & limits

- **No custom signaling, no mesh.** LiveKit owns signaling + forwarding; Socket.IO is
  only app-level events (chat/presence) — intentionally separate from LiveKit's data
  channel for validation, history and rich payloads.
- `IN_MEMORY_STORE=true` trades persistence for zero-setup: rooms/users/history live
  in process memory. Compose always runs the real Postgres/Redis stack.
- LiveKit Cloud removes the need to run `livekit` + `coturn`; set three env vars and go.
