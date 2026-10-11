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

## 🚀 Quickstart — local Docker

**Prerequisites:** Docker Desktop (Compose v2). Nothing else — no local Node, no
database, no SFU install.

```bash
cp .env.example .env      # local-only defaults; change the three "change-me" values
docker compose up --build -d
```

Open **https://localhost** in a browser. The self-signed certificate in `./certs/`
triggers a one-time browser warning — click through it. Two tabs makes a call:
start a meeting in one, paste the invite link in the other.

```bash
docker compose ps           # all services healthy
docker compose logs -f backend
docker compose down         # stop (keeps the Postgres volume)
docker compose down -v      # stop and delete all local data
```

**Use HTTP instead?** Delete `certs/fullchain.pem` and restart. The frontend
falls back to plain HTTP on port 80 automatically (`docker/select-nginx-conf.sh`).
Browsers treat `localhost` as a secure context, so camera and microphone still
work without TLS.

### How the local stack is wired

`docker compose up` starts six services on an internal `NexMeet` bridge network:

| Service | Role | Published to host |
|---|---|---|
| `frontend` | nginx — serves the SPA, proxies `/api`, `/socket.io`, `/livekit` | 80, 443 |
| `backend` | Express REST + Socket.IO | *no* (internal only) |
| `migrate` | runs `prisma migrate deploy` once, then exits 0 | — |
| `postgres` | rooms + users | *no* (internal only) |
| `redis` | Socket.IO adapter | *no* (internal only) |
| `livekit` | SFU + signaling | 7880, 7881, 50000-50100/udp |
| `coturn` | TURN fallback | 3478, 5349 |

Everything reaches the app through **https://localhost** on a single origin, so
there are no CORS or split-origin problems. Postgres and Redis are deliberately
unpublished — the `DATABASE_URL` and `REDIS_URL` in `.env` use compose service
names (`postgres`, `redis`), never `localhost`.

### Notes for local-only use

- **`.env` is gitignored.** It holds real secrets, so only `.env.example` is
  committed. Each service reads its config from there.
- **`POSTGRES_USER` must match the user in `DATABASE_URL`.** Postgres role names
  are case-sensitive, and these values only apply when the data volume is first
  created. If you change the role after the first boot, wipe the volume
  (`docker compose down -v`) so it is re-initialised consistently.
- **`migrate` runs before `backend` starts.** A failed migration leaves the
  `migrate` container exited non-zero and the backend down, instead of
  crash-looping.
- **Ports 80 and 443 need a free port** — another web server or a previous
  `iisexpress` will block the bind. If so, remap them in `docker-compose.yml`
  (e.g. `"8080:80"`, `"8443:443"`) and add the new origin to `CLIENT_URL`.
- **Testing on a phone over Wi-Fi** — see below; it needs `LAN_IP` plus a cert
  that covers the LAN address.

### Accessing from other devices on the same Wi-Fi

The stack binds to `0.0.0.0`, so it is reachable on your LAN IP, but three
things must be configured or the page loads and then fails to connect:

| Requirement | Why |
|---|---|
| `LAN_IP=<host IPv4>` in `.env` | LiveKit otherwise advertises its **container** IP (`172.19.0.5`), which no phone can reach. Signaling connects, media never does. Passed as `--node-ip`. |
| That IP in `CLIENT_URL` | CORS returns **no** `Access-Control-Allow-Origin` for unlisted origins, so every API call is blocked. |
| A cert covering that IP | The self-signed pair only lists `localhost`/`127.0.0.1`, so the browser rejects it for the LAN address. |

```bash
# 1) find your LAN IP
ipconfig                                    # Windows -> "IPv4 Address"

# 2) set LAN_IP=192.168.1.10 and add the matching
#    http(s)://192.168.1.10 origins to CLIENT_URL in .env

# 3) regenerate the certificate so it covers the LAN IP
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout certs/privkey.pem -out certs/fullchain.pem \
  -subj "/CN=NexMeet local dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.10"

# 4) apply (livekit + backend must pick up the new values)
docker compose up -d --force-recreate livekit backend frontend
```

Then open `https://192.168.1.10` on the other device and accept the
certificate warning. Verify the SFU is advertising the right address:

```bash
docker compose logs livekit | grep nodeIP     # expect "nodeIP": "192.168.1.10"
```

**Windows Firewall** blocks inbound traffic by default. Open these ports
(run PowerShell as administrator):

```powershell
80,443,7880,7881,3478/tcp and 50000-50100/udp, 3478/udp
```

Docker Desktop usually adds its own rules, but the **media UDP range is the one
that commonly stays blocked** — and it is the one that matters. If video works
but is frozen or one-directional, that range is the first thing to check.

Phones on mobile data instead of Wi-Fi will not work: `livekit.yaml` keeps
`use_external_ip: false` and coturn is not advertised to clients.


### Local development without Docker (optional)

For fast server-side iteration you can bypass the stack:

```bash
docker compose up -d postgres redis livekit   # infra only
cd server && npm install && npm run dev       # http://localhost:3000
cd client && npm install && npm run dev       # http://localhost:5173
```

`server/.env.example` defaults to `IN_MEMORY_STORE=true` (no Postgres/Redis)
with LiveKit's `devkey`/`secret` dev credentials.

> Cloud deployment recipes (`deploy/`, `render.yaml`, `client/vercel.json`,
> `DEPLOY.md`) are retained from an earlier deployment target but are **not** part
> of the local workflow and are not exercised by it.

---

## 🔑 Environment variables

All of these live in the repo-root `.env` (copy from `.env.example`), which
`docker-compose.yml` injects into the containers. Hostnames there are **compose
service names**, not `localhost`.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP listen port inside the backend container (default 3000) |
| `CLIENT_URL` | CORS + Socket.IO origin allowlist (comma-separated) |
| `JWT_SECRET` | Signs app-level JWTs (guest sessions, socket handshake) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | SFU keypair — **server-side only** |
| `LIVEKIT_WS_URL` | Server-side informational SFU URL; browsers use the same-origin `/livekit` proxy |
| `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` | Postgres bootstrap values, applied on first volume init only |
| `DATABASE_URL` | Postgres DSN used by Prisma — its user must match `POSTGRES_USER` |
| `REDIS_URL` | Enables the Socket.IO Redis adapter |
| `TURN_DOMAIN` / `TURN_SECRET` | coturn credentials (must match `turnserver.conf`) |
| `IN_MEMORY_STORE` | `true` = run without Postgres/Redis — only for non-Docker dev |
| `VITE_API_URL` / `VITE_SOCKET_URL` | Client-side; leave unset, the same-origin proxy is the default |


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

# Socket.IO smoke test against the running Docker stack.
# Creates a room through the API, then exercises chat, presence,
# auth rejection and rate limiting over the nginx proxy.
node scripts/socket-smoke.mjs <room-slug>
```

The smoke test defaults to `https://localhost` and trusts the self-signed cert
in `./certs` automatically. Pass a different origin to override it, e.g.
`node scripts/socket-smoke.mjs <room-slug> http://localhost:8080`.


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
