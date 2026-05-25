// Reusable short guide audio (iOS silent-mode playback; gate with `enabled` per screen).
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export function useGuideAudio(enabled: boolean, audioSource: number | undefined) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioModeReadyRef = useRef(false);

  const unload = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (!sound) return;
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios' || audioSource == null) {
      void unload();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (!audioModeReadyRef.current) {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          audioModeReadyRef.current = true;
        }

        await unload();
        if (cancelled) return;

        const { sound } = await Audio.Sound.createAsync(audioSource, {
          shouldPlay: true,
          isLooping: false,
        });

        if (cancelled) {
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
      } catch {
        // non-blocking
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, audioSource, unload]);

  useEffect(() => {
    return () => {
      void unload();
    };
  }, [unload]);

  return { unload };
}
