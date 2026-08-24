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

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  unread: 0,

  addMessage: (msg, opts) =>
    set((state) => ({
      messages: [...state.messages, msg].slice(-500),
      unread: opts?.countUnread && !msg.system ? state.unread + 1 : state.unread,
    })),

  setMessages: (msgs) => set({ messages: msgs }),
  resetUnread: () => set({ unread: 0 }),
  clear: () => set({ messages: [], unread: 0 }),
}));
