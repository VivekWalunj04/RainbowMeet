import { create } from 'zustand';

export type LayoutMode = 'grid' | 'speaker';

interface UIState {
  chatOpen: boolean;
  participantsOpen: boolean;
  layoutMode: LayoutMode;
  /** Controls bar auto-hide (fade after 5s of inactivity) */
  controlsVisible: boolean;
  /** Raised hands, keyed by participant display name (lowercased) */
  raisedHands: Record<string, string>;
  /** Timestamp the local user connected — drives the meeting timer */
  joinedAt: number | null;

  toggleChat: () => void;
  toggleParticipants: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setControlsVisible: (visible: boolean) => void;
  setHandRaised: (name: string, raised: boolean) => void;
  setJoinedAt: (ts: number | null) => void;
  /** Reset per-meeting state on leave */
  resetMeetingState: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  chatOpen: false,
  participantsOpen: false,
  layoutMode: 'grid',
  controlsVisible: true,
  raisedHands: {},
  joinedAt: null,

  // Opening one side panel closes the other (they share the right edge)
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen, participantsOpen: false })),
  toggleParticipants: () => set((s) => ({ participantsOpen: !s.participantsOpen, chatOpen: false })),

  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setControlsVisible: (controlsVisible) => set({ controlsVisible }),

  setHandRaised: (name, raised) =>
    set((s) => {
      const key = name.trim().toLowerCase();
      const raisedHands = { ...s.raisedHands };
      if (raised) raisedHands[key] = name;
      else delete raisedHands[key];
      return { raisedHands };
    }),

  setJoinedAt: (joinedAt) => set({ joinedAt }),

  resetMeetingState: () =>
    set({ chatOpen: false, participantsOpen: false, raisedHands: {}, joinedAt: null, controlsVisible: true }),
}));
