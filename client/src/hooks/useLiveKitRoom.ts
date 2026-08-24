import { useCallback } from 'react';
import { useConnectionState, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import type { ConnectionState, LocalParticipant, Room } from 'livekit-client';

export interface LiveKitRoomHandle {
  room: Room;
  connectionState: ConnectionState;
  localParticipant: LocalParticipant;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  /** Switch capture device mid-call (kind: 'videoinput' | 'audioinput' | 'audiooutput') */
  switchDevice: (kind: MediaDeviceKind, deviceId: string) => Promise<void>;
  leave: () => Promise<void>;
}

/**
 * Thin wrapper around the LiveKit component hooks: one place for the
 * in-call media actions (mute, camera, screen share, device switching,
 * disconnect). Must be used inside <LiveKitRoom>.
 */
export function useLiveKitRoom(): LiveKitRoomHandle {
  const room = useRoomContext();
  const connectionState = useConnectionState(room);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();

  const toggleMicrophone = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
  }, [localParticipant]);

  const toggleCamera = useCallback(async () => {
    await localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
  }, [localParticipant]);

  const toggleScreenShare = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled);
  }, [localParticipant]);

  const switchDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      await room.switchActiveDevice(kind, deviceId);
    },
    [room],
  );

  const leave = useCallback(async () => {
    await room.disconnect();
  }, [room]);

  return {
    room,
    connectionState,
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    switchDevice,
    leave,
  };
}
