# NexMeet — Cloud Deployment Guide

Split-origin production architecture:

```
 Vercel (SPA)          Render/AWS (API + Socket.IO)      EC2 (SFU)
┌──────────────┐  HTTPS REST   ┌──────────────────┐  wss   ┌─────────────────┐
│ NexMeet-    │ ────────────▶ │ NexMeet-server  │ ─────▶ │ livekit + caddy │
│ client       │  wss socket   │ (Docker)         │        │ (auto-TLS)      │
└──────────────┘               └────────┬─────────┘        └─────────────────┘
                                        │                        ▲
                              ┌─────────┴────────┐    UDP media │
                              ▼                  ▼              │
                        Neon Postgres      Upstash Redis   browsers
```

Browsers connect **directly** to each service (no same-origin proxy exists on
Vercel) — every URL below is a real public origin with TLS.

---

## 0. Prerequisites

- A domain you control (e.g. `yourdomain.com`) — needed for the SFU's TLS cert.
- Accounts: [Vercel](https://vercel.com), [Render](https://render.com),
  AWS (EC2), [Neon](https://neon.tech), [Upstash](https://upstash.com).
- Generate the LiveKit keypair once and reuse it in steps 3 & 4:

```bash
KEY="API$(tr -dc A-Za-z0-9 </dev/urandom | head -c16)"
SECRET="$(openssl rand -hex 32)"
echo "$KEY / $SECRET"
```

## 1. Neon PostgreSQL

1. Create project `NexMeet` → copy the **pooled** connection string.
2. Append `?sslmode=require` if not present:

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/nexmeet?sslmode=require
```

Tables are created automatically on first backend boot (`prisma migrate deploy`
runs in the container entrypoint; migrations live in `server/src/prisma/migrations`).

## 2. Upstash Redis

1. Create a Regional (not Global) database → copy the TLS connection string:

```
rediss://default:<token>@xxx.upstash.io:6379
```

Optional for single-instance deploys — the server runs fine without it
(chat/presence stay in-process), so skip if the adapter gives you trouble.

## 3. LiveKit SFU on EC2

**Instance:** Ubuntu 22.04+, t3.micro is enough for 4–5 person rooms
(media relay is the bottleneck — scale to t3.small for multiple rooms).
Install Docker: `curl -fsSL https://get.docker.com | sh`

**Security group (inbound):**

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH (restrict to your IP) |
| 80 | TCP | ACME challenge → HTTPS redirect |
| 443 | TCP | Signaling over wss (Caddy) |
| 7881 | TCP | ICE/TCP fallback |
| 50000–50100 | UDP | Media |

(7880 stays internal — Caddy proxies it.)

**DNS:** A record `sfu.yourdomain.com` → instance public IP.

**Deploy:**

```bash
scp -r deploy/ec2-sfu ubuntu@<ec2-ip>:~/sfu && ssh ubuntu@<ec2-ip>
cd ~/sfu
cp .env.example .env && nano .env     # set SFU_DOMAIN + keypair from step 0
sudo docker compose up -d
```

**Verify:** `curl https://sfu.yourdomain.com` should return LiveKit's response
within ~30 s (Caddy needs a moment to issue the certificate).

## 4. Backend on Render

Option A — Blueprint: push this repo to GitHub → Render → **New → Blueprint** →
fill the `sync: false` prompts:

| Var | Value |
|---|---|
| `CLIENT_URL` | `https://<app>.vercel.app` (add custom domains later, comma-separated) |
| `LIVEKIT_API_KEY/SECRET` | keypair from step 0 |
| `LIVEKIT_WS_URL` | `wss://sfu.yourdomain.com` |
| `DATABASE_URL` | step 1 |
| `REDIS_URL` | step 2 |

Option B — manual Docker web service: root dir `server/`, health check path
`/api/health`, same env vars. Render runs `prisma migrate deploy` automatically
via the image entrypoint.

> Free plan sleeps after 15 min idle and kills live meetings — use Starter
> ($7/mo) for anything real. WebSocket upgrade requires Starter.

**Verify:** `curl https://nexmeet-server.onrender.com/api/health` → `{"ok":true,...}`

## 5. Frontend on Vercel

1. Vercel → **Add New Project** → import repo.
2. Framework preset auto-detects Vite; root directory: `client`.
3. Set environment variables (Production + Preview):

```
VITE_API_URL=https://nexmeet-server.onrender.com
VITE_SOCKET_URL=wss://nexmeet-server.onrender.com
VITE_LIVEKIT_WS_URL=wss://sfu.yourdomain.com
```

(These also exist as defaults in `client/vercel.json` — replace the
placeholder values there if you prefer committing them.)

4. Deploy. SPA deep links (`/room/xxxx`) work via the rewrite rule.

## 6. End-to-end checklist

- [ ] `https://<app>.vercel.app` loads, guest join works
- [ ] Two browsers see/hear each other (media flows via EC2 SFU)
- [ ] Chat + presence work (Socket.IO over wss to Render)
- [ ] Camera/mic allowed — requires valid TLS everywhere (all three origins are https/wss ✓)
- [ ] `GET /api/health` returns `storage: "postgres"`
- [ ] EC2: `sudo docker compose logs caddy` shows successful cert issuance

## Cost snapshot (approx., monthly)

| Piece | Service | Cost |
|---|---|---|
| Frontend | Vercel Hobby | $0 |
| Backend | Render Starter | $7 |
| SFU | EC2 t3.small (+EBS) | ~$15 |
| DB | Neon free tier | $0 |
| Cache | Upstash free tier | $0 |

## Troubleshooting

- **`invalid API key`** — keypair mismatch between Render env and EC2 `.env`.
- **Signal connects, no media** — security group missing UDP 50000–50100, or
  `use_external_ip: false` in the SFU's `livekit.yaml`.
- **Mixed-content errors in console** — some `VITE_*` URL still using `http://`/`ws://`.
- **Chat dead but video works** — `VITE_SOCKET_URL` wrong or Render plan can't
  upgrade WebSockets.
