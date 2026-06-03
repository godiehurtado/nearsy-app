// On-demand help audio (iOS silent-mode playback).
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export function useHelpAudio() {
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

  const play = useCallback(
    async (source: number) => {
      if (Platform.OS !== 'ios') return;

      try {
        if (!audioModeReadyRef.current) {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          audioModeReadyRef.current = true;
        }

        await unload();

        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: true,
          isLooping: false,
        });

        soundRef.current = sound;
      } catch {
        // non-blocking
      }
    },
    [unload],
  );

  useEffect(() => {
    return () => {
      void unload();
    };
  }, [unload]);

  return { play, unload };
}
