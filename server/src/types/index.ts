/** Authenticated principal attached to every request / socket. */
export interface AuthUser {
  /** User id (subject of the app JWT) */
  sub: string;
  name: string;
  kind: 'guest' | 'user';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** In-meeting chat message (Socket.IO payload, broadcast verbatim). */
export interface ChatMessage {
  id: string;
  roomSlug: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  system?: boolean;
  /** Lamport clock value — total order across backend instances. */
  lamport: number;
  /** Backend process that issued the message (tie-break for lamport). */
  nodeId: string;
}

export interface ApiError {
  error: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
