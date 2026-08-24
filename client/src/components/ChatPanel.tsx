import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ChatPanelProps {
  sendMessage: (text: string) => void;
  connected: boolean;
}

/**
 * Right-side chat sidebar (320px). Full-screen overlay on mobile.
 * Switching to LiveKit's data channel later only means swapping the
 * transport inside useChat — this component stays as-is.
 */
export default function ChatPanel({ sendMessage, connected }: ChatPanelProps) {
  const open = useUIStore((s) => s.chatOpen);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const messages = useChatStore((s) => s.messages);
  const resetUnread = useChatStore((s) => s.resetUnread);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Opening the panel clears the unread badge
  useEffect(() => {
    if (open) resetUnread();
  }, [open, resetUnread]);

  // Auto-scroll to newest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage(text);
    setDraft('');
  };

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-30 flex w-full transform flex-col border-l border-zinc-800 bg-surface-800/95 backdrop-blur transition-transform duration-200 sm:w-80 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">In-meeting chat</h2>
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`}
            title={connected ? 'Chat connected' : 'Chat reconnecting…'}
          />
        </div>
        <button
          type="button"
          onClick={toggleChat}
          className="rounded-md p-1.5 text-zinc-400 transition-colors duration-200 hover:bg-surface-600 hover:text-zinc-200"
          title="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="scrollbar-thin-dark min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-xs text-zinc-500">
            No messages yet. Say hi! 👋
          </p>
        )}
        {messages.map((m) =>
          m.system ? (
            <p key={m.id} className="text-center text-[11px] italic text-zinc-500">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="group">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-zinc-200">{m.senderName}</span>
                <span className="text-[10px] text-zinc-500">{formatTime(m.timestamp)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-surface-600/70 px-3 py-1.5 text-sm text-zinc-100">
                {m.text}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={1000}
            placeholder="Type a message…"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700/60 bg-surface-600/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors duration-200 focus:border-accent"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors duration-200 hover:bg-accent-hover disabled:opacity-40"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
