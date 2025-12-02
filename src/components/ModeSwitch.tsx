// src/components/ModeSwitch.tsx
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { adjustColor } from '../utils/colors';

interface Props {
  mode: 'personal' | 'professional';
  onToggle: () => void;
  topBarColor?: string;
  compact?: boolean;
}

export default function ModeSwitch({
  mode,
  onToggle,
  topBarColor,
  compact,
}: Props) {
  // ✅ Usamos useRef para no recrear la animación en cada render
  const translateX = useRef(
    new Animated.Value(mode === 'personal' ? 0 : 1),
  ).current;

  const baseColor: string = topBarColor ?? '#3B5A85';
  const light2: string = adjustColor(baseColor, 60);
  const light1: string = adjustColor(baseColor, 40);
  const dark: string = adjustColor(baseColor, -30);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: mode === 'personal' ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [mode, translateX]);

  const thumbPosition = translateX.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '52%'],
  });

  return (
    <TouchableWithoutFeedback onPress={onToggle}>
      <LinearGradient
        colors={mode === 'personal' ? [light2, light1] : [baseColor, dark]}
        style={[
          styles.container,
          compact && styles.containerCompact, // 👈 más estrecho en modo compacto
        ]}
      >
        <Animated.View style={[styles.thumb, { left: thumbPosition }]}>
          <Text style={styles.thumbText}>
            {mode === 'personal' ? '🧑‍🤝‍🧑' : '💼'}
          </Text>
        </Animated.View>

        {/* En modo compacto ocultamos los textos para que no se rompa el diseño */}
        {!compact && (
          <View style={styles.labelContainer}>
            <Text style={styles.label}>Professional</Text>
            <Text style={styles.label}>Personal</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '70%',
    height: 50,
    borderRadius: 25,
    padding: 5,
    justifyContent: 'center',
    position: 'relative',
    alignSelf: 'center',
  },
  // 👇 En modo compacto lo hacemos un poco más angosto
  containerCompact: {
    width: '55%',
  },
  thumb: {
    position: 'absolute',
    top: 5,
    width: '45%',
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    elevation: 3,
  },
  thumbText: {
    fontSize: 18,
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  label: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
