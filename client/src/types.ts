/** Shared client-side types (mirror the server's payloads). */

export interface RoomInfo {
  slug: string;
  name: string;
  createdAt?: string;
  isActive?: boolean;
}

export interface GuestAuthResponse {
  token: string;
  user: { id: string; name: string; kind: 'guest' | 'user'; email: string | null };
}

export interface JoinResponse {
  /** LiveKit room access token (expires 2h after issue) */
  token: string;
  /** Browser-facing LiveKit WebSocket URL */
  wsUrl: string;
  /** LiveKit participant identity */
  identity: string;
  room: RoomInfo;
}

export interface ChatMessage {
  id: string;
  roomSlug: string;
  senderId?: string;
  senderName: string;
  text: string;
  timestamp: number;
  system?: boolean;
  /** Lamport clock value — total order across backend instances. */
  lamport?: number;
  /** Backend process that issued the message (tie-break for lamport). */
  nodeId?: string;
}

/** Options chosen on the pre-join screen. */
export interface PreJoinChoices {
  displayName: string;
  cameraId: string;
  microphoneId: string;
  camEnabled: boolean;
  micEnabled: boolean;
}
