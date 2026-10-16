import React, { useEffect, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  fallback: React.ReactNode;
  accessibilityIgnoresInvertColors?: boolean;
};

/**
 * Renders a remote/local avatar URI with a coherent placeholder on load error.
 */
export function ProfileAvatarImage({
  uri,
  style,
  fallback,
  accessibilityIgnoresInvertColors,
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return <>{fallback}</>;
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      accessibilityIgnoresInvertColors={accessibilityIgnoresInvertColors}
      onError={() => setFailed(true)}
    />
  );
}
