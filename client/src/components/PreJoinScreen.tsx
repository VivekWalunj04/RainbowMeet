import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';

import { useMediaDevices } from '../hooks/useMediaDevices';
import { getSavedName } from '../lib/api';
import type { PreJoinChoices } from '../types';

interface PreJoinScreenProps {
  roomSlug: string;
  roomTitle?: string;
  initialName?: string;
  onJoin: (choices: PreJoinChoices) => void | Promise<void>;
  onCancel: () => void;
  /** External error from a failed join attempt */
  joinError?: string | null;
  joining?: boolean;
}

/**
 * Pre-join lobby: live camera preview, mic/camera toggles, device pickers,
 * display-name input, then "Join meeting".
 */
export default function PreJoinScreen({
  roomSlug,
  roomTitle,
  initialName,
  onJoin,
  onCancel,
  joinError,
  joining = false,
}: PreJoinScreenProps) {
  const { cameras, microphones, previewStream, error, startPreview, stopPreview } =
    useMediaDevices();

  const [displayName, setDisplayName] = useState(initialName ?? getSavedName());
  const [cameraId, setCameraId] = useState('');
  const [microphoneId, setMicrophoneId] = useState('');
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // (Re)start the preview whenever the selected devices change
  useEffect(() => {
    void startPreview(cameraId || undefined, microphoneId || undefined);
    return () => stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, microphoneId]);

  // Attach stream to the <video> element
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = previewStream;
  }, [previewStream]);

  // Mirror toggles onto the preview tracks
  useEffect(() => {
    previewStream?.getVideoTracks().forEach((t) => (t.enabled = camEnabled));
  }, [previewStream, camEnabled]);
  useEffect(() => {
    previewStream?.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  }, [previewStream, micEnabled]);

  const canJoin = displayName.trim().length > 0 && !joining;

  const handleJoin = () => {
    if (!canJoin) return;
    stopPreview();
    void onJoin({
      displayName: displayName.trim(),
      cameraId,
      microphoneId,
      camEnabled,
      micEnabled,
    });
  };

  const toggleClass = (on: boolean) =>
    `absolute bottom-3 flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${
      on ? 'bg-surface-600/90 text-zinc-100 hover:bg-surface-600' : 'bg-red-500 text-white hover:bg-red-400'
    }`;

  const selectClass =
    'w-full rounded-lg border border-zinc-700/70 bg-surface-600/60 px-3 py-2 text-xs text-zinc-200 outline-none transition-colors duration-200 focus:border-accent';

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-lg">
        <button
          type="button"
          onClick={onCancel}
          className="mb-4 flex items-center gap-1.5 text-xs text-zinc-400 transition-colors duration-200 hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <div className="rounded-2xl border border-zinc-800 bg-surface-800/80 p-5 shadow-2xl backdrop-blur sm:p-6">
          <h1 className="text-base font-semibold text-zinc-100">{roomTitle || 'Join meeting'}</h1>
          <p className="mb-4 truncate text-xs text-zinc-500">Room: {roomSlug}</p>

          {/* Preview */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-zinc-800">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {!camEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-800">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/25 text-lg font-semibold text-accent-hover">
                  {displayName.trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('') || '?'}
                </span>
              </div>
            )}
            {!previewStream && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting camera…
              </div>
            )}
            <button
              type="button"
              onClick={() => setMicEnabled((v) => !v)}
              className={`${toggleClass(micEnabled)} left-3`}
              title={micEnabled ? 'Mute' : 'Unmute'}
            >
              {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setCamEnabled((v) => !v)}
              className={`${toggleClass(camEnabled)} left-[4.25rem]`}
              title={camEnabled ? 'Stop camera' : 'Start camera'}
            >
              {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </button>
          </div>

          {error && <p className="mt-3 text-xs text-amber-400">{error}</p>}

          {/* Device pickers */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className={selectClass}
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
            >
              <option value="">Default camera</option>
              {cameras.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={microphoneId}
              onChange={(e) => setMicrophoneId(e.target.value)}
            >
              <option value="">Default microphone</option>
              {microphones.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${d.deviceId.slice(0, 4)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Name + Join */}
          <input
            className="mt-4 w-full rounded-xl border border-zinc-700/70 bg-surface-600/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors duration-200 focus:border-accent"
            placeholder="Your name"
            value={displayName}
            maxLength={64}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />

          <button
            type="button"
            onClick={handleJoin}
            disabled={!canJoin}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining && <Loader2 className="h-4 w-4 animate-spin" />}
            {joining ? 'Joining…' : 'Join meeting'}
          </button>

          {joinError && <p className="mt-3 text-center text-xs text-red-400">{joinError}</p>}
        </div>
      </div>
    </div>
  );
}
