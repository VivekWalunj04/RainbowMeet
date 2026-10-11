# NexMeet — Production Deployment Guide

Production architecture topology:

```
 Vercel (Frontend SPA)     AWS EC2 (API + Socket.IO)         AWS EC2 (LiveKit SFU)
┌────────────────────┐   HTTPS REST  ┌──────────────────┐  wss   ┌─────────────────┐
│ nexmeet.vercel.app │ ────────────▶ │ api.yourdomain   │ ─────▶ │ sfu.yourdomain  │
│ (Vite React)       │   wss socket  │ (Express+Caddy)  │        │ (LiveKit+Caddy) │
└────────────────────┘               └────────┬─────────┘        └─────────────────┘
                                              │                        ▲
                                    ┌─────────┴────────┐    UDP media │
                                    ▼                  ▼              │
                              Neon Postgres      Upstash Redis   browsers
                              (Database)         (PubSub/Adapter)
```

Browsers connect **directly** to each service:
- Frontend on **Vercel** (`https://nexmeet.vercel.app`)
- Backend API & Socket.IO on **AWS EC2** (`https://api.yourdomain.com`)
- LiveKit WebRTC SFU on **AWS EC2** (`wss://sfu.yourdomain.com`)
- Managed database on **Neon PostgreSQL**
- Managed cache & real-time adapter on **Upstash Redis**

---

## 0. Prerequisites & Domain Options

### Option A: No Custom Domain (100% Free Wildcard DNS - Recommended if you don't own a domain)
You do **not** need to buy a domain! You can use free wildcard DNS services like **`nip.io`** or **`sslip.io`**.
They automatically map domain names back to your EC2 instance's public IP address, allowing Caddy to automatically issue **free Let's Encrypt TLS certificates**:

If your EC2 public IP is `54.210.10.20`:
- **Backend API Domain:** `api-54-210-10-20.nip.io` ➔ resolves to `54.210.10.20`
- **LiveKit SFU Domain:** `sfu-54-210-10-20.nip.io` ➔ resolves to `54.210.10.20`

### Option B: Custom Domain
If you own a domain (e.g. `yourdomain.com`), point DNS A records:
- `api.yourdomain.com` ➔ Backend EC2 Public IP
- `sfu.yourdomain.com` ➔ LiveKit SFU EC2 Public IP

### Keypair Generation
Accounts required: [Vercel](https://vercel.com), AWS (EC2), [Neon](https://neon.tech), and [Upstash](https://upstash.com).
Generate a secure LiveKit keypair once:

```bash
KEY="API$(tr -dc A-Za-z0-9 </dev/urandom | head -c16)"
SECRET="$(openssl rand -hex 32)"
echo "LIVEKIT_API_KEY=$KEY"
echo "LIVEKIT_API_SECRET=$SECRET"
```

---

## 1. Neon PostgreSQL Setup

1. Create a project `NexMeet` in [Neon Console](https://console.neon.tech).
2. Copy the **pooled** connection string.
3. Ensure `?sslmode=require` is present at the end of the URL:

```
postgresql://neondb_owner:password@ep-xxx-pooler.us-east-2.aws.neon.tech/nexmeet?sslmode=require
```

Migrations run automatically via the one-shot `migrate` service (`npx prisma migrate deploy`) before the backend starts.

---

## 2. Upstash Redis Setup

1. Create a Regional Redis database in [Upstash Console](https://console.upstash.com).
2. Copy the TLS connection string:

```
rediss://default:password@xxx.upstash.io:6379
```

Upstash handles multi-instance Socket.IO fan-out and real-time state synchronization.

---

## 3. LiveKit SFU on AWS EC2

**Instance:** Ubuntu 22.04 LTS (t3.small or t3.medium recommended).
Install Docker:
```bash
curl -fsSL https://get.docker.com | sh
```

**Security Group (Inbound rules):**

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| 22 | TCP | Your IP | SSH |
| 80 | TCP | 0.0.0.0/0 | ACME HTTP-01 challenge (Let's Encrypt) |
| 443 | TCP | 0.0.0.0/0 | WebRTC Signaling over WSS (Caddy) |
| 7881 | TCP | 0.0.0.0/0 | WebRTC TCP fallback |
| 50000–50100 | UDP | 0.0.0.0/0 | WebRTC Media relay |

**Deploy:**

```bash
scp -r deploy/ec2-sfu ubuntu@<SFU-EC2-IP>:~/sfu
ssh ubuntu@<SFU-EC2-IP>
cd ~/sfu
cp .env.example .env
nano .env   # Set SFU_DOMAIN=sfu.yourdomain.com and LIVEKIT_API_KEY / SECRET
sudo docker compose up -d --build
```

**Verify:** `curl https://sfu.yourdomain.com` returns LiveKit response after ~20 seconds.

---

## 4. Backend API & WebSockets on AWS EC2

**Instance:** Ubuntu 22.04 LTS (t3.micro or t3.small).
Install Docker: `curl -fsSL https://get.docker.com | sh`

**Security Group (Inbound rules):**

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| 22 | TCP | Your IP | SSH |
| 80 | TCP | 0.0.0.0/0 | ACME HTTP-01 challenge |
| 443 | TCP | 0.0.0.0/0 | HTTPS REST API & WSS Socket.IO |

**Deploy:**

```bash
# Upload server code and deploy files to EC2
scp -r server deploy ubuntu@<BACKEND-EC2-IP>:~/nexmeet
ssh ubuntu@<BACKEND-EC2-IP>
cd ~/nexmeet/deploy/ec2-backend
cp .env.example .env
nano .env   # Configure API_DOMAIN, CLIENT_URL, JWT_SECRET, DATABASE_URL, REDIS_URL, LIVEKIT_*
sudo docker compose up -d --build
```

> **Single-EC2 Alternative:** If you prefer running Backend + SFU on 1 EC2 instance to minimize cost, use `deploy/ec2-combined/` instead!

**Verify:** `curl https://api.yourdomain.com/api/health` returns:
```json
{"ok":true,"uptime":12.3,"timestamp":1700000000,"storage":"postgres"}
```

---

## 5. Frontend on Vercel

1. Log into [Vercel](https://vercel.com) -> **Add New Project** -> Import your NexMeet git repository.
2. Framework Preset: **Vite**. Root Directory: `client`.
3. Configure Environment Variables under **Project Settings ➔ Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api.yourdomain.com` |
| `VITE_SOCKET_URL` | `wss://api.yourdomain.com` |
| `VITE_LIVEKIT_WS_URL` | `wss://sfu.yourdomain.com` |

4. Click **Deploy**. SPA routes (`/room/xxxx`) are handled automatically by `vercel.json`.

---

## 6. Verification & Health Check

Run the automated health check script against your backend server:

```bash
node scripts/production-check.mjs
```

### End-to-end Verification Checklist:
- [ ] `https://nexmeet.vercel.app` loads cleanly without console errors.
- [ ] `POST /api/auth/guest` generates a valid session JWT.
- [ ] Room creation and joining issue a short-lived LiveKit token.
- [ ] Two separate browser windows join the same room and stream video/audio.
- [ ] In-meeting chat and hand-raise events broadcast in real-time via Socket.IO + Upstash Redis.
- [ ] `GET https://api.yourdomain.com/api/health` returns `storage: "postgres"`.

---

## Cost Snapshot (Approximate Monthly Cost)

| Service | Component | Estimated Cost |
|---|---|---|
| Frontend | Vercel Hobby | $0 |
| Backend | AWS EC2 (t3.micro) | ~$6–$8 |
| SFU | AWS EC2 (t3.small) | ~$15 |
| Database | Neon PostgreSQL Free Tier | $0 |
| Redis | Upstash Redis Free Tier | $0 |
| **Total** | | **~$21–$23 / month** |

---

## Troubleshooting

- **`invalid API key` on join**: LiveKit API key/secret mismatch between Backend EC2 `.env` and SFU EC2 `.env`.
- **Connected to room, but black video / no audio**: EC2 Security group is missing UDP 50000–50100, or `use_external_ip: true` is missing in `livekit.yaml`.
- **Socket.IO connection failed**: Check that `VITE_SOCKET_URL` uses `wss://` (not `ws://`), and verify Caddy container logs (`sudo docker compose logs caddy`).
- **Prisma migration error**: Verify Neon pooled URL ends with `?sslmode=require`.
