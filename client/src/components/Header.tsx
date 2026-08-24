import { useEffect, useState } from 'react';
import { Check, Link2, Users } from 'lucide-react';
import { useConnectionState, useParticipants } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';

import { useUIStore } from '../store/uiStore';

const CONNECTION_META: Record<string, { label: string; dot: string }> = {
  [ConnectionState.Connected]: { label: 'Connected', dot: 'bg-emerald-400' },
  [ConnectionState.Connecting]: { label: 'Connecting…', dot: 'bg-amber-400' },
  [ConnectionState.Reconnecting]: { label: 'Reconnecting…', dot: 'bg-amber-400 animate-pulse' },
  [ConnectionState.Disconnected]: { label: 'Disconnected', dot: 'bg-red-400' },
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Top bar: room name, live connection status, timer, headcount, invite link. */
export default function Header({ roomName }: { roomName: string }) {
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const joinedAt = useUIStore((s) => s.joinedAt);

  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  // 1s tick drives the meeting timer
  useEffect(() => {
    if (!joinedAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [joinedAt]);

  const meta = CONNECTION_META[connectionState as string] ?? CONNECTION_META[ConnectionState.Connecting];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard API can fail in insecure contexts; select fallback
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-surface-800/70 px-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden text-sm font-bold tracking-tight text-accent-hover sm:block">
          NexMeet
        </span>
        <span className="hidden h-4 w-px bg-zinc-700 sm:block" />
        <h1 className="truncate text-sm font-medium text-zinc-200" title={roomName}>
          {roomName}
        </h1>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-600/70 px-2 py-0.5 text-xs text-zinc-300">
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          <span className="hidden sm:inline">{meta.label}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {joinedAt && (
          <span className="rounded-full bg-surface-600/70 px-2.5 py-0.5 font-mono text-xs tabular-nums text-zinc-300">
            {formatElapsed(now - joinedAt)}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Users className="h-4 w-4 text-zinc-400" />
          {participants.length}
        </span>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent-hover transition-colors duration-200 hover:bg-accent/25"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy invite link'}</span>
        </button>
      </div>
    </header>
  );
}
