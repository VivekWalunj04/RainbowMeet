import { AccessToken } from 'livekit-server-sdk';

import { config } from '../config';

export interface LivekitJoinCredentials {
  /** JWT the client hands to <LiveKitRoom token={...}> */
  token: string;
  /** Browser-facing WebSocket URL of the SFU */
  wsUrl: string;
  /** LiveKit participant identity embedded in the token */
  identity: string;
}

/**
 * Mint a room-scoped LiveKit access token.
 *
 * Runs SERVER-SIDE ONLY — the LiveKit API secret must never reach the client.
 * Tokens expire 2 hours after issue (config.livekit.roomTokenTtlSeconds).
 */
export async function generateLivekitToken(
  roomName: string,
  participantName: string,
  identity: string,
): Promise<LivekitJoinCredentials> {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name: participantName,
    ttl: config.livekit.roomTokenTtlSeconds,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // lightweight realtime events (e.g. typing pings)
  });

  const token = await at.toJwt();

  return { token, wsUrl: config.livekit.wsUrl, identity };
}
