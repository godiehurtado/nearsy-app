import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation } from '@react-navigation/native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const INTRO_VIDEO_KEY = 'hasSeenIntroVideo';

export default function IntroVideoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isPreview = route?.params?.preview === true;

  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: 900,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, [pulse]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const finishIntro = useCallback(async () => {
    try {
      if (!isPreview) {
        await AsyncStorage.setItem(INTRO_VIDEO_KEY, 'true');
        navigation.replace('Register', { showGuide: true });
        return;
      }

      navigation.goBack();
    } catch {
      if (isPreview) {
        navigation.goBack();
      } else {
        navigation.replace('Register', { showGuide: true });
      }
    }
  }, [isPreview, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" />

      <View style={styles.circleOne} />
      <View style={styles.circleTwo} />

      <Animated.View entering={FadeInDown.duration(650)} style={styles.card}>
        <Animated.View style={[styles.logoCircle, logoAnimatedStyle]}>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
        </Animated.View>

        <Animated.Text
          entering={FadeInUp.delay(150).duration(550)}
          style={styles.title}
        >
          Welcome to Nearsy
        </Animated.Text>

        <Animated.Text
          entering={FadeInUp.delay(250).duration(550)}
          style={styles.subtitle}
        >
          Create your account and start connecting with people around you.
        </Animated.Text>

        <Animated.View
          entering={FadeInUp.delay(350).duration(550)}
          style={styles.stepsCard}
        >
          <View style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <Ionicons name="mail" size={18} color="#3B5A85" />
            </View>
            <Text style={styles.stepText}>Add your email and password</Text>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <Ionicons name="calendar" size={18} color="#3B5A85" />
            </View>
            <Text style={styles.stepText}>Confirm your birth year</Text>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <Ionicons name="checkmark-circle" size={18} color="#3B5A85" />
            </View>
            <Text style={styles.stepText}>
              Accept terms and finish setting up your profile
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(450).duration(550)}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.86}
            onPress={finishIntro}
          >
            <Text style={styles.primaryButtonText}>Start registration</Text>
            <Ionicons name="arrow-forward" size={18} color="#1A2B3C" />
          </TouchableOpacity>

          <View style={styles.loginShortcut}>
            <Text style={styles.loginLabel}>Already part of Nearsy?</Text>
            <TouchableOpacity
              style={styles.loginButton}
              activeOpacity={0.82}
              onPress={() => navigation.navigate('Login')}
            >
              <Ionicons name="log-in-outline" size={16} color="#3B5A85" />
              <Text style={styles.loginButtonText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {isPreview && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3B5A85',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  circleOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(173,203,227,0.22)',
    top: -70,
    right: -70,
  },
  circleTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.12)',
    bottom: -50,
    left: -60,
  },
  card: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 14,
  },
  logoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  logo: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2B3A42',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
  },
  stepsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  primaryButton: {
    minWidth: 230,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ADCBE3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    gap: 8,
  },
  primaryButtonText: {
    color: '#1A2B3C',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 16,
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  loginShortcut: {
    marginTop: 18,
    alignItems: 'center',
  },
  loginLabel: {
    color: '#7C8794',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  loginButton: {
    minWidth: 132,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(59,90,133,0.24)',
    backgroundColor: 'rgba(238,244,250,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
  },
  loginButtonText: {
    color: '#3B5A85',
    fontSize: 14,
    fontWeight: '800',
  },
});
