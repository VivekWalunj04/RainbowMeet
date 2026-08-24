import { useCallback, useEffect, useRef, useState } from 'react';

export interface MediaDevicesHook {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  /** Live getUserMedia stream for the pre-join preview (null when stopped) */
  previewStream: MediaStream | null;
  error: string | null;
  refreshDevices: () => Promise<void>;
  startPreview: (videoDeviceId?: string, audioDeviceId?: string) => Promise<MediaStream | null>;
  stopPreview: () => void;
}

function group(devices: MediaDeviceInfo[]) {
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    microphones: devices.filter((d) => d.kind === 'audioinput'),
    speakers: devices.filter((d) => d.kind === 'audiooutput'),
  };
}

/**
 * Camera/mic enumeration + a managed getUserMedia preview stream.
 * Used by the pre-join screen and by the in-call device switcher
 * (enumeration only — in-call capture is owned by LiveKit).
 */
export function useMediaDevices(): MediaDevicesHook {
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({
    cameras: [],
    microphones: [],
    speakers: [],
  });
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPreviewStream(null);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(group(list));
    } catch {
      /* enumeration can fail before permissions — ignore */
    }
  }, []);

  const startPreview = useCallback(
    async (videoDeviceId?: string, audioDeviceId?: string): Promise<MediaStream | null> => {
      stopPreview();
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoDeviceId
            ? { deviceId: { ideal: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: audioDeviceId ? { deviceId: { ideal: audioDeviceId } } : true,
        });
        streamRef.current = stream;
        setPreviewStream(stream);
        // Device labels become available only after a permission grant
        await refreshDevices();
        return stream;
      } catch (err) {
        const name = (err as DOMException).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera/microphone permission denied. Allow access in your browser settings and retry.'
            : name === 'NotFoundError'
              ? 'No camera or microphone found on this device.'
              : 'Could not access media devices.',
        );
        return null;
      }
    },
    [refreshDevices, stopPreview],
  );

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
      stopPreview();
    };
  }, [refreshDevices, stopPreview]);

  return { ...devices, previewStream, error, refreshDevices, startPreview, stopPreview };
}
