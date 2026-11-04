import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

export const WEBSITE_SOCIAL_PLATFORM = {
  id: 'website',
  ionicon: 'globe-outline',
  iconSet: 'ionicons' as const,
  color: '#64748B',
};

/** The large icon every social card uses, in the CRJ and in the editor. */
export function SocialPlatformGlyph({
  platform,
}: {
  platform: {
    id: string;
    ionicon: string;
    iconSet: 'ionicons' | 'fontawesome6';
    color: string;
  };
}) {
  const markColor = platform.id === 'snapchat' ? '#111111' : '#FFFFFF';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.glyph,
        {
          backgroundColor: platform.color,
          borderColor:
            platform.id === 'x' || platform.id === 'tiktok'
              ? 'rgba(255,255,255,0.12)'
              : 'transparent',
        },
      ]}
    >
      {platform.iconSet === 'fontawesome6' ? (
        <FontAwesome6
          name={platform.ionicon as React.ComponentProps<typeof FontAwesome6>['name']}
          size={16}
          color={markColor}
        />
      ) : (
        <Ionicons
          name={platform.ionicon as React.ComponentProps<typeof Ionicons>['name']}
          size={18}
          color={markColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
