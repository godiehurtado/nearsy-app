import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  authColors,
  authRadius,
  authTypography,
} from '../theme/authTokens';

/**
 * Auth social provider row — single visual source used by Login and Welcome.
 * Preserves the approved Login look: Ionicons logo + provider name + border.
 * Extracted from LoginScreen without changing Login appearance or behaviour.
 *
 * Apple Sign-In is not offered on Android (final product decision).
 */
export type AuthSocialProvider = 'google' | 'apple' | 'meta' | 'linkedin';

const ALL_PROVIDERS: {
  id: AuthSocialProvider;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'google', icon: 'logo-google' },
  { id: 'apple', icon: 'logo-apple' },
  { id: 'meta', icon: 'logo-facebook' },
  { id: 'linkedin', icon: 'logo-linkedin' },
];

const PROVIDERS =
  Platform.OS === 'android'
    ? ALL_PROVIDERS.filter((p) => p.id !== 'apple')
    : ALL_PROVIDERS;

export type AuthSocialButtonRowProps = {
  labels: Record<AuthSocialProvider, string>;
  onPress: (provider: AuthSocialProvider) => void;
  /** Disables all tiles except an optional loading provider. */
  busy?: boolean;
  loadingProvider?: AuthSocialProvider | null;
  borderColor?: string;
  textColor?: string;
  pressedBackground?: string;
};

export function AuthSocialButtonRow({
  labels,
  onPress,
  busy = false,
  loadingProvider = null,
  borderColor = authColors.inputBorder,
  textColor = authColors.textPrimary,
  pressedBackground = authColors.panel,
}: AuthSocialButtonRowProps) {
  return (
    <View style={styles.socialRow}>
      {PROVIDERS.map((provider) => {
        const isLoading = loadingProvider === provider.id;

        return (
          <Pressable
            key={provider.id}
            accessibilityRole="button"
            accessibilityLabel={labels[provider.id]}
            style={({ pressed }) => [
              styles.socialButton,
              {
                borderColor,
                backgroundColor: pressed ? pressedBackground : 'transparent',
                opacity: busy && !isLoading ? 0.55 : 1,
              },
            ]}
            onPress={() => onPress(provider.id)}
            disabled={busy}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={textColor} />
            ) : (
              <>
                <Ionicons
                  name={provider.icon}
                  size={14}
                  color={textColor}
                  style={styles.socialIcon}
                />
                <Text
                  style={[styles.socialText, { color: textColor }]}
                  numberOfLines={1}
                >
                  {labels[provider.id]}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  socialButton: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: authRadius.social,
    flexDirection: 'row',
  },
  socialIcon: {
    marginRight: 4,
  },
  socialText: {
    ...authTypography.social,
  },
});
