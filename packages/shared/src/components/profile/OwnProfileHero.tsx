import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { cardShadow } from '../../theme/shadows';
import ModeSwitch, { type ProfileModeValue } from '../ModeSwitch';

type Props = {
  profileImage: string | null;
  realName: string;
  lastName: string;
  mode: ProfileModeValue;
  modeContextLabel: string;
  personalLabel: string;
  professionalLabel: string;
  changePhotoLabel: string;
  changePhotoA11y: string;
  modeSwitchA11y: string;
  editorWritable: boolean;
  modeSwitchLoading: boolean;
  onChangePhoto: () => void;
  onToggleMode: () => void;
};

export default function OwnProfileHero({
  profileImage,
  realName,
  lastName,
  mode,
  modeContextLabel,
  personalLabel,
  professionalLabel,
  changePhotoLabel,
  changePhotoA11y,
  modeSwitchA11y,
  editorWritable,
  modeSwitchLoading,
  onChangePhoto,
  onToggleMode,
}: Props) {
  const { palette } = useAppTheme();
  const displayName = [realName.trim(), lastName.trim()].filter(Boolean).join(' ');

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
        cardShadow,
      ]}
    >
      <View style={styles.heroRow}>
        <View style={styles.avatarWrap}>
          {profileImage ? (
            <Image
              source={{ uri: profileImage }}
              style={[
                styles.avatar,
                { borderColor: palette.borderStrong },
              ]}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarPlaceholder,
                {
                  backgroundColor: palette.chipBg,
                  borderColor: palette.borderStrong,
                },
              ]}
            >
              <Ionicons
                name="person"
                size={40}
                color={palette.textMuted}
              />
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={changePhotoA11y}
            accessibilityHint={changePhotoLabel}
            disabled={!editorWritable}
            onPress={onChangePhoto}
            style={({ pressed }) => [
              styles.photoButton,
              {
                backgroundColor: palette.primary,
                borderColor: palette.surface,
              },
              pressed && styles.pressed,
              !editorWritable && styles.disabled,
            ]}
            hitSlop={8}
          >
            <Ionicons name="camera" size={16} color={palette.surface} />
          </Pressable>
        </View>

        <View style={styles.identityCol}>
          <Text
            style={[styles.name, { color: palette.textPrimary }]}
            numberOfLines={3}
            accessibilityRole="header"
          >
            {displayName || '—'}
          </Text>
          <Text
            style={[styles.modeContext, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            {modeContextLabel}
          </Text>
        </View>
      </View>

      <ModeSwitch
        mode={mode}
        onToggle={onToggleMode}
        personalLabel={personalLabel}
        professionalLabel={professionalLabel}
        disabled={!editorWritable}
        loading={modeSwitchLoading}
        accessibilityHint={modeSwitchA11y}
      />
    </View>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: screenPadding.horizontal,
    marginTop: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCol: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  modeContext: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
});
