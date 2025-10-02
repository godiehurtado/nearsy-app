import React from 'react';
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
  isEditing?: boolean;
}

export default function ModeSwitch({
  mode,
  onToggle,
  topBarColor,
  isEditing = false,
}: Props) {
  const translateX = new Animated.Value(mode === 'personal' ? 0 : 1);

  // asegúrate de que topBarColor siempre sea string
  const baseColor: string = topBarColor ?? '#3B5A85';
  const light2: string = adjustColor(baseColor, 60); // más claro

  const light1: string = adjustColor(baseColor, 40); // claro
  const dark: string = adjustColor(baseColor, -30); // oscuro

  Animated.timing(translateX, {
    toValue: mode === 'personal' ? 0 : 1,
    duration: 300,
    useNativeDriver: false,
  }).start();

  const thumbPosition = translateX.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '52%'],
  });

  return (
    <TouchableWithoutFeedback onPress={onToggle} disabled={!isEditing}>
      <LinearGradient
        colors={mode === 'personal' ? [light2, light1] : [baseColor, dark]} // <-- siempre string[]
        style={styles.container}
      >
        <Animated.View style={[styles.thumb, { left: thumbPosition }]}>
          <Text style={styles.thumbText}>
            {mode === 'personal' ? '🧑‍🤝‍🧑' : '💼'}
          </Text>
        </Animated.View>

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Professional</Text>
          <Text style={styles.label}>Personal</Text>
        </View>
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
