import { useState } from 'react';
import { ArrowRight, Keyboard, Loader2, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { createRoom, guestAuth, parseRoomInput, saveName, setToken } from '../lib/api';

/**
 * Landing card: enter your name → start a new meeting (gets a shareable
 * link) or paste an invite link / room code to join an existing one.
 */
export default function RoomJoinScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState(localStorage.getItem('nexmeet.name') ?? '');
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validName = name.trim().length > 0;

  /** Always mint a fresh guest token so the JWT name matches this session. */
  const authenticate = async () => {
    const displayName = name.trim();
    const { token } = await guestAuth(displayName);
    setToken(token);
    saveName(displayName);
    return displayName;
  };

  const handleCreate = async () => {
    if (!validName || busy) return;
    setBusy('create');
    setError(null);
    try {
      const displayName = await authenticate();
      const { room } = await createRoom(`${displayName}'s meeting`);
      navigate(`/room/${room.slug}`, { state: { displayName } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the meeting');
      setBusy(null);
    }
  };

  const handleJoin = async () => {
    if (!validName || busy) return;
    const slug = parseRoomInput(joinInput);
    if (!slug) {
      setError('That does not look like a valid invite link or room code.');
      return;
    }
    setBusy('join');
    setError(null);
    try {
      const displayName = await authenticate();
      navigate(`/room/${slug}`, { state: { displayName } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the meeting');
      setBusy(null);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-zinc-700/70 bg-surface-600/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors duration-200 focus:border-accent';

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-surface-800/80 p-6 shadow-2xl backdrop-blur sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
          <Video className="h-5 w-5 text-accent-hover" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">NexMeet</h1>
          <p className="text-xs text-zinc-400">Video meetings for small teams</p>
        </div>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">Your name</span>
        <input
          className={inputClass}
          placeholder="e.g. Priya Sharma"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (joinInput.trim() ? handleJoin() : handleCreate())}
        />
      </label>

      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={!validName || busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
        Start a new meeting
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />
        or join with a link / code
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Paste invite link or room code"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleJoin()}
          />
        </div>
        <button
          type="button"
          onClick={() => void handleJoin()}
          disabled={!validName || !joinInput.trim() || busy !== null}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 transition-colors duration-200 hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'join' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Join
        </button>
      </div>

      {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
