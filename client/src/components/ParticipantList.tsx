import { Hand, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import { useParticipants } from '@livekit/components-react';

import { useUIStore } from '../store/uiStore';

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}

/** Right-side roster with per-participant mic / camera / hand status. */
export default function ParticipantList() {
  const open = useUIStore((s) => s.participantsOpen);
  const toggle = useUIStore((s) => s.toggleParticipants);
  const raisedHands = useUIStore((s) => s.raisedHands);
  const participants = useParticipants();

  // Local participant first, then everyone else alphabetically
  const sorted = [...participants].sort((a, b) => {
    if (a.isLocal) return -1;
    if (b.isLocal) return 1;
    return (a.name || a.identity).localeCompare(b.name || b.identity);
  });

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-30 flex w-full transform flex-col border-l border-zinc-800 bg-surface-800/95 backdrop-blur transition-transform duration-200 sm:w-80 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <h2 className="text-sm font-semibold text-zinc-100">
          Participants <span className="text-zinc-400">({participants.length})</span>
        </h2>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-1.5 text-zinc-400 transition-colors duration-200 hover:bg-surface-600 hover:text-zinc-200"
          title="Close participants"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-thin-dark min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.map((p) => {
          const name = p.name || p.identity;
          const raised = Boolean(name && raisedHands[name.trim().toLowerCase()]);
          return (
            <div
              key={p.identity}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-surface-600/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-600 text-xs font-semibold text-zinc-200">
                {initialsOf(name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {name}
                {p.isLocal ? ' (You)' : ''}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-zinc-400">
                {raised && <Hand className="h-4 w-4 text-amber-400" />}
                {p.isMicrophoneEnabled ? (
                  <Mic className="h-4 w-4" />
                ) : (
                  <MicOff className="h-4 w-4 text-red-400" />
                )}
                {p.isCameraEnabled ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <VideoOff className="h-4 w-4 text-zinc-500" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
