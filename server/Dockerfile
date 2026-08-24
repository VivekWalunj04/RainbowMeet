# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install OpenSSL for Prisma native binaries
RUN apk add --no-cache openssl git curl

COPY package*.json ./
RUN npm ci

COPY . .
# Generate Prisma client with explicit binary target
RUN npx prisma generate --schema=src/prisma/schema.prisma && npm run build

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install OpenSSL at runtime too
RUN apk add --no-cache openssl

# Copy node_modules from build stage (includes generated Prisma engines + CLI
# used by `prisma migrate deploy` at container start).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY src/prisma ./src/prisma

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/prisma/schema.prisma && node dist/server.js"]
