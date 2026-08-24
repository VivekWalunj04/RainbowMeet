import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from '@livekit/components-react';
import { VideoPresets, type RoomOptions } from 'livekit-client';

import ChatPanel from '../components/ChatPanel';
import ControlsBar from '../components/ControlsBar';
import Header from '../components/Header';
import ParticipantList from '../components/ParticipantList';
import PreJoinScreen from '../components/PreJoinScreen';
import VideoGrid from '../components/VideoGrid';
import { useChat } from '../hooks/useChat';
import { fetchRoom, getToken, guestAuth, joinRoom, saveName, setToken, LIVEKIT_WS_URL } from '../lib/api';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import type { JoinResponse, PreJoinChoices } from '../types';

type Phase = 'prejoin' | 'in-call' | 'left' | 'error';

/** In-call layout — must live inside <LiveKitRoom> so hooks can resolve. */
function MeetingLayout({
  roomName,
  roomSlug,
  displayName,
  socketToken,
}: {
  roomName: string;
  roomSlug: string;
  displayName: string;
  socketToken: string;
}) {
  const room = useRoomContext();

  const { sendMessage, setHandRaised, connected } = useChat({
    roomSlug,
    displayName,
    token: socketToken,
    active: true,
  });

  const controlsVisible = useUIStore((s) => s.controlsVisible);
  const setControlsVisible = useUIStore((s) => s.setControlsVisible);

  // Auto-hide the controls bar after 5s of inactivity (reappear on movement)
  useEffect(() => {
    let timer: number;
    const poke = () => {
      setControlsVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setControlsVisible(false), 5000);
    };
    poke();
    window.addEventListener('mousemove', poke);
    window.addEventListener('mousedown', poke);
    window.addEventListener('touchstart', poke);
    window.addEventListener('keydown', poke);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', poke);
      window.removeEventListener('mousedown', poke);
      window.removeEventListener('touchstart', poke);
      window.removeEventListener('keydown', poke);
    };
  }, [setControlsVisible]);

  // Best-effort audio unlock for strict autoplay policies
  useEffect(() => {
    room.startAudio().catch(() => {});
  }, [room]);

  return (
    <div className="flex h-screen flex-col bg-surface">
      <Header roomName={roomName} />
      <main className="min-h-0 flex-1">
        <VideoGrid />
      </main>
      <ControlsBar visible={controlsVisible} setHandRaised={setHandRaised} />
      <ChatPanel sendMessage={sendMessage} connected={connected} />
      <ParticipantList />
      {/* Renders all remote audio tracks */}
      <RoomAudioRenderer />
    </div>
  );
}

/**
 * Room lifecycle: prejoin → fetch LiveKit creds → connect → left/error.
 */
export default function RoomPage() {
  const { roomSlug = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const initialName = (location.state as { displayName?: string } | null)?.displayName;

  const [phase, setPhase] = useState<Phase>('prejoin');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinData, setJoinData] = useState<JoinResponse | null>(null);
  const [choices, setChoices] = useState<PreJoinChoices | null>(null);
  const [socketToken, setSocketToken] = useState('');
  const [roomTitle, setRoomTitle] = useState('');

  // Pre-join header nicety: resolve the room title when we already hold a token
  useEffect(() => {
    if (!roomSlug || !getToken()) return;
    fetchRoom(roomSlug)
      .then(({ room }) => setRoomTitle(room.name))
      .catch(() => {});
  }, [roomSlug]);

  const handleJoin = useCallback(
    async (c: PreJoinChoices) => {
      setJoining(true);
      setError(null);
      try {
        // Fresh guest JWT so the session identity matches the chosen name
        const { token } = await guestAuth(c.displayName);
        setToken(token);
        saveName(c.displayName);

        const data = await joinRoom(roomSlug, c.displayName);
        setSocketToken(token);
        setJoinData(data);
        setChoices(c);
        useUIStore.getState().setJoinedAt(Date.now());
        setPhase('in-call');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not join the meeting');
      } finally {
        setJoining(false);
      }
    },
    [roomSlug],
  );

  const handleDisconnected = useCallback(() => {
    useUIStore.getState().resetMeetingState();
    useChatStore.getState().clear();
    setJoinData(null);
    setChoices(null);
    setSocketToken('');
    setPhase('left');
  }, []);

  /* ── Left / ended screen ── */
  if (phase === 'left' || phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-surface-800/80 p-8 text-center shadow-2xl backdrop-blur">
          {phase === 'error' ? (
            <>
              <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-400" />
              <h1 className="text-lg font-semibold text-zinc-100">Connection problem</h1>
              <p className="mt-2 text-sm text-zinc-400">
                {error ?? 'We could not connect you to the meeting.'}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-zinc-100">You left the meeting</h1>
              <p className="mt-2 text-sm text-zinc-400">Thanks for joining. See you next time!</p>
            </>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPhase('prejoin');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-hover"
            >
              <RotateCcw className="h-4 w-4" /> Rejoin meeting
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 transition-colors duration-200 hover:bg-surface-600"
            >
              <Home className="h-4 w-4" /> Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── In-call ── */
  if (phase === 'in-call' && joinData && choices) {
    const roomOptions: RoomOptions = {
      // Saves downlink bandwidth: lower-quality or paused streams for hidden tiles
      adaptiveStream: true,
      // Server-side: stop forwarding video for tiles nobody can see
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
        ...(choices.cameraId ? { deviceId: { ideal: choices.cameraId } } : {}),
      },
      audioCaptureDefaults: {
        ...(choices.microphoneId ? { deviceId: { ideal: choices.microphoneId } } : {}),
      },
    };

    return (
      <LiveKitRoom
        token={joinData.token}
        serverUrl={LIVEKIT_WS_URL}
        connect
        audio={choices.micEnabled}
        video={choices.camEnabled}
        options={roomOptions}
        onDisconnected={handleDisconnected}
        onError={(err) => {
          setError(err.message);
          handleDisconnected();
          setPhase('error');
        }}
      >
        <MeetingLayout
          roomName={joinData.room.name}
          roomSlug={roomSlug}
          displayName={choices.displayName}
          socketToken={socketToken}
        />
      </LiveKitRoom>
    );
  }

  /* ── Pre-join lobby ── */
  return (
    <PreJoinScreen
      roomSlug={roomSlug}
      roomTitle={roomTitle}
      initialName={initialName}
      onJoin={handleJoin}
      onCancel={() => navigate('/')}
      joinError={error}
      joining={joining}
    />
  );
}
