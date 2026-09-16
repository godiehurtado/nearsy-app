import { useCallback, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';

import type { GuideAudioSource } from '../constants/guideAudioAssets';

export function useGuideAudio() {
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopAudio = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (!sound) return;

    try {
      await sound.stopAsync();
    } catch {
      // ignore
    }

    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  }, []);

  const playAudio = useCallback(
    async (source: GuideAudioSource | null | undefined) => {
      if (!source) {
        await stopAudio();
        return;
      }

      await stopAudio();

      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound } = await Audio.Sound.createAsync(source);
        soundRef.current = sound;
        await sound.playAsync();
      } catch (error) {
        if (__DEV__) {
          console.warn('[useGuideAudio] playback failed', error);
        }
      }
    },
    [stopAudio],
  );

  useEffect(() => {
    return () => {
      void stopAudio();
    };
  }, [stopAudio]);

  return { playAudio, stopAudio };
}
