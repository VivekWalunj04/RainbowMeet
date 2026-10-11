import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import type { ChatMessage } from '../types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string | undefined;

interface UseChatOptions {
  roomSlug: string;
  displayName: string;
  /** App JWT for the Socket.IO auth handshake */
  token: string;
  /** Connect only when true (after the user joined the call) */
  active: boolean;
}

export interface ChatHandle {
  connected: boolean;
  sendMessage: (text: string) => void;
  setHandRaised: (raised: boolean) => void;
}

/**
 * In-meeting chat + presence over Socket.IO — deliberately separate from
 * LiveKit's data channel so we get structured payloads, server-side
 * validation, history and rate limiting.
 */
export function useChat({ roomSlug, displayName, token, active }: UseChatOptions): ChatHandle {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!active) return;

    const socket = io(SOCKET_URL ?? '/', {
      auth: { token },
      // Websocket-only: with multiple backend instances behind a load balancer,
      // polling handshakes can land on different nodes and break the session.
      // A single WS connection stays pinned to one instance, so no sticky
      // sessions are required.
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('room:join', { roomSlug, displayName });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('chat:history', (messages: ChatMessage[]) => {
      useChatStore.getState().setMessages(messages);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      const { chatOpen } = useUIStore.getState();
      useChatStore.getState().addMessage(msg, { countUnread: !chatOpen });
    });

    socket.on('presence:raise-hand', ({ name, raised }: { name: string; raised: boolean }) => {
      useUIStore.getState().setHandRaised(name, raised);
    });

    // Lightweight presence → system messages in the chat stream
    socket.on('presence:participant-joined', ({ name }: { name: string }) => {
      useChatStore.getState().addMessage({
        id: `sys-join-${Date.now()}-${name}`,
        roomSlug,
        senderName: name,
        text: `${name} joined the meeting`,
        timestamp: Date.now(),
        system: true,
      });
    });

    socket.on('presence:participant-left', ({ name }: { name: string }) => {
      useUIStore.getState().setHandRaised(name, false);
      useChatStore.getState().addMessage({
        id: `sys-left-${Date.now()}-${name}`,
        roomSlug,
        senderName: name,
        text: `${name} left the meeting`,
        timestamp: Date.now(),
        system: true,
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [active, roomSlug, displayName, token]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      socketRef.current?.emit('chat:message', { roomSlug, text: trimmed });
    },
    [roomSlug],
  );

  const setHandRaised = useCallback(
    (raised: boolean) => {
      socketRef.current?.emit('presence:raise-hand', { roomSlug, raised });
      useUIStore.getState().setHandRaised(displayName, raised);
    },
    [roomSlug, displayName],
  );

  return { connected, sendMessage, setHandRaised };
}
