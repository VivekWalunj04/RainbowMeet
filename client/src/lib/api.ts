import type { GuestAuthResponse, JoinResponse, RoomInfo } from '../types';

/**
 * REST client for the NexMeet backend.
 *
 * Defaults to the same origin — in dev, Vite proxies /api to the server;
 * in prod, Nginx does. Set VITE_API_URL only for split-origin deployments.
 */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/**
 * LiveKit signal endpoint for <LiveKitRoom serverUrl>.
 *
 * Defaults to the same origin — in dev, Vite proxies /livekit to the SFU;
 * in prod, Nginx does. Survives LAN IP changes because it follows whatever
 * host the page was opened on. Set VITE_LIVEKIT_WS_URL only for split-origin
 * deployments or direct LiveKit Cloud connections.
 */
export const LIVEKIT_WS_URL =
  (import.meta.env.VITE_LIVEKIT_WS_URL as string | undefined) ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/livekit`;

const TOKEN_KEY = 'nexmeet.token';
const NAME_KEY = 'nexmeet.name';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const getSavedName = (): string => localStorage.getItem(NAME_KEY) ?? '';
export const saveName = (name: string): void => localStorage.setItem(NAME_KEY, name);

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiRequestError(res.status, body.error ?? `Request failed (${res.status})`);
  return body;
}

/** Obtain a short-lived app JWT for a display name (idempotent per join). */
export function guestAuth(name: string): Promise<GuestAuthResponse> {
  return request<GuestAuthResponse>('/api/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function createRoom(title?: string): Promise<{ room: RoomInfo }> {
  return request<{ room: RoomInfo }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export function fetchRoom(slug: string): Promise<{ room: RoomInfo }> {
  return request<{ room: RoomInfo }>(`/api/rooms/${encodeURIComponent(slug)}`);
}

/** Mint LiveKit credentials for a room. Rate-limited server-side. */
export function joinRoom(slug: string, displayName: string): Promise<JoinResponse> {
  return request<JoinResponse>(`/api/rooms/${encodeURIComponent(slug)}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  });
}

/** Extract a room slug from a pasted invite link or bare code. */
export function parseRoomInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/room\/([a-z0-9-]+)/i);
    return match?.[1] ?? null;
  } catch {
    // Not a URL — treat as a bare slug/code
    return /^[a-z0-9-]{2,64}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
  }
}
