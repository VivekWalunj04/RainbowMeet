import { useMemo } from 'react';
import { Hand, Mic, MicOff } from 'lucide-react';
import {
  useConnectionQualityIndicator,
  useIsSpeaking,
  VideoTrack,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ConnectionQuality, Track } from 'livekit-client';

/** Connection quality → indicator bars + colors */
const QUALITY_META: Partial<
  Record<ConnectionQuality, { label: string; bars: number; color: string }>
> = {
  [ConnectionQuality.Excellent]: { label: 'Excellent', bars: 3, color: 'bg-emerald-400' },
  [ConnectionQuality.Good]: { label: 'Good', bars: 2, color: 'bg-amber-400' },
  [ConnectionQuality.Poor]: { label: 'Poor', bars: 1, color: 'bg-red-400' },
  [ConnectionQuality.Lost]: { label: 'Connection lost', bars: 0, color: 'bg-zinc-600' },
};

const FALLBACK_META = { label: 'Unknown', bars: 0, color: 'bg-zinc-600' };

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

/** Deterministic pastel-ish hue per participant for the avatar backdrop. */
function hueOf(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
  return hash;
}

interface VideoTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  /** Show a raised-hand badge for this display name */
  handRaised?: boolean;
}

/**
 * One participant tile: camera video (or initials avatar when muted/off),
 * name overlay (bottom-left), mic state (bottom-right), connection quality
 * (top-right), active-speaker ring and raised-hand badge.
 */
export default function VideoTile({ trackRef, handRaised }: VideoTileProps) {
  const { participant, source } = trackRef;
  const isScreenShare = source === Track.Source.ScreenShare;

  // Placeholders (camera off / not yet published) have no publication
  const publication = 'publication' in trackRef ? trackRef.publication : undefined;
  const hasVideo = Boolean(publication?.track && !publication.isMuted);

  const { quality } = useConnectionQualityIndicator({ participant });
  const meta = QUALITY_META[quality] ?? FALLBACK_META;

  const isSpeaking = useIsSpeaking(isScreenShare ? undefined : participant);
  const micEnabled = participant.isMicrophoneEnabled;

  const displayName = participant.name || participant.identity;
  const initials = useMemo(() => initialsOf(displayName), [displayName]);
  const hue = useMemo(() => hueOf(participant.identity || displayName), [participant.identity, displayName]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl bg-surface-800 transition-all duration-200 ${
        isSpeaking && !isScreenShare ? 'ring-2 ring-emerald-400/90' : 'ring-1 ring-zinc-800'
      }`}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef as TrackReference}
          className={`h-full w-full ${isScreenShare ? 'bg-black object-contain' : 'object-cover'}`}
        />
      ) : (
        // Camera off (or screenshare placeholder): colored initials avatar
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 45% 22%) 0%, hsl(${(hue + 40) % 360} 45% 14%) 100%)`,
          }}
        >
          <div
            className="flex items-center justify-center rounded-full font-semibold text-white/90"
            style={{ backgroundColor: `hsl(${hue} 60% 42%)` }}
          >
            <span className="flex h-14 w-14 items-center justify-center text-xl sm:h-20 sm:w-20 sm:text-2xl">
              {initials}
            </span>
          </div>
        </div>
      )}

      {/* Connection quality — top right */}
      <div
        className="absolute right-2 top-2 flex items-end gap-[2px] rounded-md bg-black/50 px-1.5 py-1"
        title={`Connection: ${meta.label}`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm ${i < meta.bars ? meta.color : 'bg-zinc-600/60'}`}
            style={{ height: `${5 + i * 3}px` }}
          />
        ))}
      </div>

      {/* Raised hand — top left */}
      {handRaised && (
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-amber-400/90 px-1.5 py-1 text-xs font-medium text-amber-950">
          <Hand className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Name — bottom left */}
      <div className="absolute bottom-2 left-2 flex max-w-[70%] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1">
        <span className="truncate text-xs font-medium text-white">
          {displayName}
          {participant.isLocal && !isScreenShare ? ' (You)' : ''}
          {isScreenShare ? "'s screen" : ''}
        </span>
      </div>

      {/* Mic state — bottom right (not relevant on a screen-share tile) */}
      {!isScreenShare && (
        <div
          className={`absolute bottom-2 right-2 rounded-full p-1.5 ${
            micEnabled ? 'bg-black/55 text-white' : 'bg-red-500/90 text-white'
          }`}
          title={micEnabled ? 'Microphone on' : 'Muted'}
        >
          {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        </div>
      )}
    </div>
  );
}
