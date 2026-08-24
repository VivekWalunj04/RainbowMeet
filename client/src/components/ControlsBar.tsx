import { useEffect, useRef, useState } from 'react';
import {
  Hand,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';

import { useLiveKitRoom } from '../hooks/useLiveKitRoom';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';

const btnBase =
  'flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const btnIdle = 'bg-surface-600/80 text-zinc-100 hover:bg-surface-600';
const btnDanger = 'bg-zinc-200 text-zinc-900 hover:bg-white'; // "off but not leaving" state

interface ControlsBarProps {
  visible: boolean;
  setHandRaised: (raised: boolean) => void;
}

/** In-call device switcher (camera / mic / speaker). */
function DeviceMenu() {
  const { switchDevice } = useLiveKitRoom();
  const { cameras, microphones, speakers, refreshDevices } = useMediaDevices();

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const selectClass =
    'w-full rounded-lg bg-surface-600 px-2 py-1.5 text-xs text-zinc-200 outline-none ring-zinc-700 focus:ring-1';

  return (
    <div className="absolute bottom-16 left-1/2 w-64 -translate-x-1/2 rounded-xl border border-zinc-700/60 bg-surface-800/95 p-3 shadow-2xl backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Devices</p>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Camera</span>
          <select
            className={selectClass}
            onChange={(e) => void switchDevice('videoinput', e.target.value)}
          >
            {cameras.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${d.deviceId.slice(0, 4)}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Microphone</span>
          <select
            className={selectClass}
            onChange={(e) => void switchDevice('audioinput', e.target.value)}
          >
            {microphones.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Mic ${d.deviceId.slice(0, 4)}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Speaker</span>
          <select
            className={selectClass}
            onChange={(e) => void switchDevice('audiooutput', e.target.value)}
          >
            {speakers.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Speaker ${d.deviceId.slice(0, 4)}`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * Bottom-center floating pill with all meeting controls.
 * Fades out after 5s of inactivity (handled by the parent via `visible`).
 */
export default function ControlsBar({ visible, setHandRaised }: ControlsBarProps) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    leave,
  } = useLiveKitRoom();

  const unread = useChatStore((s) => s.unread);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const toggleParticipants = useUIStore((s) => s.toggleParticipants);
  const layoutMode = useUIStore((s) => s.layoutMode);
  const setLayoutMode = useUIStore((s) => s.setLayoutMode);

  const [raised, setRaised] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the device menu when clicking anywhere else
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const run = (fn: () => Promise<void>) => () => void fn().catch(() => {});

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div
        className={`pointer-events-auto relative flex items-center gap-2 rounded-full border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 shadow-2xl backdrop-blur-md transition-all duration-200 sm:gap-2.5 ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        }`}
        ref={menuRef}
      >
        {/* Mic */}
        <button
          type="button"
          onClick={run(toggleMicrophone)}
          className={`${btnBase} ${isMicrophoneEnabled ? btnIdle : btnDanger}`}
          title={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>

        {/* Camera */}
        <button
          type="button"
          onClick={run(toggleCamera)}
          className={`${btnBase} ${isCameraEnabled ? btnIdle : btnDanger}`}
          title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        >
          {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>

        {/* Screen share */}
        <button
          type="button"
          onClick={run(toggleScreenShare)}
          className={`${btnBase} ${isScreenShareEnabled ? 'bg-accent text-white hover:bg-accent-hover' : btnIdle}`}
          title={isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}
        >
          <MonitorUp className="h-5 w-5" />
        </button>

        {/* Raise hand */}
        <button
          type="button"
          onClick={() => {
            const next = !raised;
            setRaised(next);
            setHandRaised(next);
          }}
          className={`${btnBase} hidden sm:flex ${raised ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : btnIdle}`}
          title={raised ? 'Lower hand' : 'Raise hand'}
        >
          <Hand className="h-5 w-5" />
        </button>

        <span className="mx-0.5 hidden h-6 w-px bg-zinc-700 sm:block" />

        {/* Layout toggle */}
        <button
          type="button"
          onClick={() => setLayoutMode(layoutMode === 'grid' ? 'speaker' : 'grid')}
          className={`${btnBase} hidden sm:flex ${btnIdle}`}
          title="Toggle grid / speaker layout"
        >
          <LayoutGrid className="h-5 w-5" />
        </button>

        {/* Participants */}
        <button
          type="button"
          onClick={toggleParticipants}
          className={`${btnBase} ${btnIdle}`}
          title="Participants"
        >
          <Users className="h-5 w-5" />
        </button>

        {/* Chat (with unread badge) */}
        <button
          type="button"
          onClick={toggleChat}
          className={`${btnBase} relative ${btnIdle}`}
          title="Chat"
        >
          <MessageSquare className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* Device settings */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className={`${btnBase} ${btnIdle}`}
          title="Device settings"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Settings className="h-5 w-5" />}
        </button>

        <span className="mx-0.5 h-6 w-px bg-zinc-700" />

        {/* Leave */}
        <button
          type="button"
          onClick={run(leave)}
          className={`${btnBase} w-14 bg-red-500 text-white hover:bg-red-400`}
          title="Leave meeting"
        >
          <PhoneOff className="h-5 w-5" />
        </button>

        {menuOpen && <DeviceMenu />}
      </div>
    </div>
  );
}
