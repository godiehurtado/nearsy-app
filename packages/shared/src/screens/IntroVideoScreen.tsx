import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus, Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation } from '@react-navigation/native';

const INTRO_VIDEO_KEY = 'hasSeenIntroVideo';

export default function IntroVideoScreen() {
  const navigation = useNavigation<any>();
  const videoRef = useRef<Video | null>(null);

  const route = useRoute<any>();
  const isPreview = route?.params?.preview === true;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;

  const [isFinishing, setIsFinishing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const finishIntro = useCallback(async () => {
    if (isFinishing) return;

    try {
      setIsFinishing(true);

      if (!isPreview) {
        await AsyncStorage.setItem(INTRO_VIDEO_KEY, 'true');
        navigation.replace('Register');
        return;
      }

      navigation.goBack();
    } catch {
      if (isPreview) {
        navigation.goBack();
      } else {
        navigation.replace('Register');
      }
    }
  }, [isFinishing, navigation, isPreview]);

  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      if (status.didJustFinish) {
        finishIntro();
      }
    },
    [finishIntro],
  );

  useEffect(() => {
    const configureAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        if (__DEV__) {
          console.log('[IntroVideo] Audio mode error:', error);
        }
      }
    };

    configureAudio();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return (
    <View style={styles.overlay}>
      <StatusBar hidden={false} barStyle="light-content" />

      <Animated.View
        style={[
          styles.modalCard,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.videoWrapper}>
          <Video
            ref={videoRef}
            source={require('../assets/intro-video.mp4')}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isMuted={false}
            volume={1.0}
            isLooping={false}
            useNativeControls={false}
            onReadyForDisplay={() => setIsReady(true)}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          />

          {!isReady && (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(59,90,133,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  modalCard: {
    width: '100%',
    maxWidth: 380,
    aspectRatio: 9 / 16,
    backgroundColor: '#3B5A85',
    borderRadius: 26,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
  },

  videoWrapper: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#3B5A85',
  },

  video: {
    width: '100%',
    height: '100%',
  },

  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#3B5A85',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
