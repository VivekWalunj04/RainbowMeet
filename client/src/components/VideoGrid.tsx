import { useMemo } from 'react';
import {
  useSpeakingParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

import { useUIStore } from '../store/uiStore';
import VideoTile from './VideoTile';

/** Tailwind grid classes by participant count (2, 3, 4, 5+ auto-arrange). */
function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-4xl';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl';
  return 'grid-cols-2 lg:grid-cols-3 max-w-7xl';
}

/**
 * Responsive meeting layout.
 *
 *  - Grid mode: CSS grid that auto-arranges 1–5 tiles.
 *  - Speaker mode (or someone screen-shares): big main tile + filmstrip.
 * Every camera participant gets a placeholder tile so "camera off" users
 * stay visible as avatars.
 */
export default function VideoGrid() {
  const layoutMode = useUIStore((s) => s.layoutMode);
  const raisedHands = useUIStore((s) => s.raisedHands);

  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], {
    onlySubscribed: false,
  });
  const speaking = useSpeakingParticipants();

  const isRaised = (t: TrackReferenceOrPlaceholder) =>
    Boolean(t.participant.name && raisedHands[t.participant.name.trim().toLowerCase()]);

  // Speaker mode focus: whoever is speaking now, else the first tile
  const speakerFocus = useMemo(() => {
    if (speaking.length === 0) return cameraTracks[0];
    return (
      cameraTracks.find((t) => t.participant.identity === speaking[0].identity) ?? cameraTracks[0]
    );
  }, [speaking, cameraTracks]);

  /* ── Screen share gets the stage, cameras go to the filmstrip ── */
  if (screenTracks.length > 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <div className="min-h-0 flex-1">
          <VideoTile trackRef={screenTracks[0]} />
        </div>
        <div className="scrollbar-thin-dark flex h-28 shrink-0 gap-2 overflow-x-auto sm:h-32">
          {cameraTracks.map((t) => (
            <div key={t.participant.identity} className="aspect-video h-full shrink-0">
              <VideoTile trackRef={t} handRaised={isRaised(t)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Speaker mode ── */
  if (layoutMode === 'speaker' && cameraTracks.length > 1) {
    const strip = cameraTracks.filter((t) => t !== speakerFocus);
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <div className="min-h-0 flex-1">
          <VideoTile trackRef={speakerFocus} handRaised={isRaised(speakerFocus)} />
        </div>
        <div className="scrollbar-thin-dark flex h-28 shrink-0 gap-2 overflow-x-auto sm:h-32">
          {strip.map((t) => (
            <div key={t.participant.identity} className="aspect-video h-full shrink-0">
              <VideoTile trackRef={t} handRaised={isRaised(t)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Grid mode (default) ── */
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-3">
      <div className={`grid w-full content-center gap-3 ${gridClass(cameraTracks.length)}`}>
        {cameraTracks.map((t) => (
          <div key={t.participant.identity} className="aspect-video min-w-[250px]">
            <VideoTile trackRef={t} handRaised={isRaised(t)} />
          </div>
        ))}
      </div>
    </div>
  );
}
