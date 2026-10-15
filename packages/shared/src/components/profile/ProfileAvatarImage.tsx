import React, { useEffect, useState } from 'react';
import {
  Image,
  View,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  placeholderStyle?: StyleProp<ViewStyle>;
  iconSize?: number;
  iconColor?: string;
  accessibilityIgnoresInvertColors?: boolean;
};

/**
 * Circular profile avatar with a coherent placeholder when the URI is missing
 * or the remote image fails to load.
 */
export default function ProfileAvatarImage({
  uri,
  style,
  placeholderStyle,
  iconSize = 40,
  iconColor = '#9CA3AF',
  accessibilityIgnoresInvertColors,
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const trimmed = typeof uri === 'string' ? uri.trim() : '';
  if (!trimmed || failed) {
    return (
      <View style={[styles.placeholder, style as ViewStyle, placeholderStyle]}>
        <Ionicons name="person" size={iconSize} color={iconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: trimmed }}
      style={style}
      accessibilityIgnoresInvertColors={accessibilityIgnoresInvertColors}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
});
