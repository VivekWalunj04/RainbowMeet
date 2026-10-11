import { create } from 'zustand';

import type { ChatMessage } from '../types';

interface ChatState {
  messages: ChatMessage[];
  /** Unread badge count while the panel is closed */
  unread: number;
  addMessage: (msg: ChatMessage, opts?: { countUnread?: boolean }) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  resetUnread: () => void;
  clear: () => void;
}

/** Order chat by Lamport timestamp (total cross-instance order), then wall clock. */
function byLamport(a: ChatMessage, b: ChatMessage): number {
  if (a.lamport !== undefined && b.lamport !== undefined) {
    if (a.lamport !== b.lamport) return a.lamport - b.lamport;
    if (a.nodeId !== b.nodeId) return (a.nodeId ?? '').localeCompare(b.nodeId ?? '');
  }
  return a.timestamp - b.timestamp;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  unread: 0,

  addMessage: (msg, opts) =>
    set((state) => ({
      messages: [...state.messages, msg].sort(byLamport).slice(-500),
      unread: opts?.countUnread && !msg.system ? state.unread + 1 : state.unread,
    })),

  setMessages: (msgs) => set({ messages: [...msgs].sort(byLamport) }),
  resetUnread: () => set({ unread: 0 }),
  clear: () => set({ messages: [], unread: 0 }),
}));
