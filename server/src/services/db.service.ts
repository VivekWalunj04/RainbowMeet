import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

import { config } from '../config';

/**
 * Persistence abstraction used by controllers/services.
 *
 * Two implementations:
 *  - PrismaDatabase  → PostgreSQL (production / full stack)
 *  - InMemoryDatabase → zero-dependency dev & demo mode (IN_MEMORY_STORE=true)
 *
 * The interface is intentionally small; swap/extend as features grow.
 */

export interface StoredUser {
  id: string;
  email: string | null;
  name: string;
  passwordHash: string | null;
  kind: 'guest' | 'user';
  createdAt: Date;
}

export interface StoredRoom {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  createdById: string | null;
}

export interface Database {
  createGuest(name: string): Promise<StoredUser>;
  createUser(name: string, email: string, passwordHash: string): Promise<StoredUser>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  createRoom(input: { slug: string; name: string; createdById?: string | null }): Promise<StoredRoom>;
  findRoomBySlug(slug: string): Promise<StoredRoom | null>;
  listRooms(): Promise<StoredRoom[]>;
}

/* ── PostgreSQL (Prisma) ─────────────────────────────────────────────── */

class PrismaDatabase implements Database {
  private prisma = new PrismaClient();

  private mapUser(u: {
    id: string; email: string | null; name: string; passwordHash: string | null;
    kind: string; createdAt: Date;
  }): StoredUser {
    return { ...u, kind: u.kind === 'user' ? 'user' : 'guest' };
  }

  async createGuest(name: string): Promise<StoredUser> {
    const u = await this.prisma.user.create({ data: { name, kind: 'guest' } });
    return this.mapUser(u);
  }

  async createUser(name: string, email: string, passwordHash: string): Promise<StoredUser> {
    const u = await this.prisma.user.create({ data: { name, email, passwordHash, kind: 'user' } });
    return this.mapUser(u);
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const u = await this.prisma.user.findUnique({ where: { email } });
    return u ? this.mapUser(u) : null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    return u ? this.mapUser(u) : null;
  }

  async createRoom(input: { slug: string; name: string; createdById?: string | null }): Promise<StoredRoom> {
    return this.prisma.room.create({
      data: { slug: input.slug, name: input.name, createdById: input.createdById ?? null },
    });
  }

  async findRoomBySlug(slug: string): Promise<StoredRoom | null> {
    return this.prisma.room.findUnique({ where: { slug } });
  }

  async listRooms(): Promise<StoredRoom[]> {
    return this.prisma.room.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }
}

/* ── In-memory (dev/demo) ────────────────────────────────────────────── */

class InMemoryDatabase implements Database {
  private users = new Map<string, StoredUser>();
  private rooms = new Map<string, StoredRoom>();

  async createGuest(name: string): Promise<StoredUser> {
    const user: StoredUser = {
      id: randomUUID(), email: null, name, passwordHash: null, kind: 'guest', createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async createUser(name: string, email: string, passwordHash: string): Promise<StoredUser> {
    const user: StoredUser = {
      id: randomUUID(), email, name, passwordHash, kind: 'user', createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    return this.users.get(id) ?? null;
  }

  async createRoom(input: { slug: string; name: string; createdById?: string | null }): Promise<StoredRoom> {
    const room: StoredRoom = {
      id: randomUUID(), slug: input.slug, name: input.name,
      isActive: true, createdAt: new Date(), createdById: input.createdById ?? null,
    };
    this.rooms.set(room.slug, room);
    return room;
  }

  async findRoomBySlug(slug: string): Promise<StoredRoom | null> {
    return this.rooms.get(slug) ?? null;
  }

  async listRooms(): Promise<StoredRoom[]> {
    return [...this.rooms.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

/* ── Selection ───────────────────────────────────────────────────────── */

export const db: Database = config.inMemory ? new InMemoryDatabase() : new PrismaDatabase();

if (config.inMemory) {
  // eslint-disable-next-line no-console
  console.log('[db] IN_MEMORY_STORE enabled — using process-memory data store (dev/demo mode)');
}
