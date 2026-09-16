import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { spacing } from '../../theme/spacing.ts';
import { radius } from '../../theme/radius.ts';
import { useTranslation } from '../../i18n/index.ts';
import type { SocialCustomLink } from '../../types/profile.ts';
import {
  CRJ_SOCIAL_PLATFORMS,
  CUSTOM_NETWORK_NAME_MAX,
  countConnectedSocials,
  type CrjSocialDraftValues,
  type CrjSocialPlatform,
  type CrjSocialPlatformId,
} from '../../social/onboardingSocialCatalog.ts';
import {
  isDuplicateCustomNetwork,
  normalizeCustomNetworkUrl,
  type CrjSocialFieldErrors,
  validateCustomNetworkName,
} from '../../social/socialLinkNormalize.ts';

type Props = {
  values: CrjSocialDraftValues;
  custom: SocialCustomLink[];
  onChangeValues: (next: CrjSocialDraftValues) => void;
  onChangeCustom: (next: SocialCustomLink[]) => void;
  fieldErrors: CrjSocialFieldErrors;
  onClearFieldError: (id: CrjSocialPlatformId | 'custom') => void;
};

function PlatformGlyph({
  platform,
  glyphColor,
}: {
  platform: CrjSocialPlatform;
  glyphColor: string;
}) {
  const isLightMark = platform.id === 'snapchat';
  return (
    <View
      style={[
        styles.glyph,
        {
          backgroundColor: platform.color,
          borderColor: platform.id === 'x' || platform.id === 'tiktok'
            ? 'rgba(255,255,255,0.12)'
            : 'transparent',
        },
      ]}
    >
      {platform.iconSet === 'fontawesome6' ? (
        <FontAwesome6
          name={platform.ionicon as React.ComponentProps<typeof FontAwesome6>['name']}
          size={12}
          color={isLightMark ? '#111111' : '#FFFFFF'}
        />
      ) : (
        <Ionicons
          name={platform.ionicon as React.ComponentProps<typeof Ionicons>['name']}
          size={14}
          color={isLightMark ? '#111111' : glyphColor}
        />
      )}
    </View>
  );
}

export function OnboardingSocialMediaStep({
  values,
  custom,
  onChangeValues,
  onChangeCustom,
  fieldErrors,
  onClearFieldError,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherUrl, setOtherUrl] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);

  const connected = countConnectedSocials(values, custom);
  const connectedLabel =
    connected === 1
      ? t('onboarding.profileCompletion.socialMedia.connectedOne' as any)
      : t('onboarding.profileCompletion.socialMedia.connected' as any, {
          count: connected,
        });

  const otherReady = otherName.trim().length > 0;

  const inputStyle = useMemo(
    () => ({
      color: palette.textPrimary,
      borderColor: palette.accentBorder,
      backgroundColor: palette.cardBg,
    }),
    [palette],
  );

  function setValue(id: CrjSocialPlatformId, text: string) {
    onClearFieldError(id);
    onChangeValues({ ...values, [id]: text });
  }

  function addOther() {
    const nameCheck = validateCustomNetworkName(otherName);
    if (!nameCheck.ok) {
      setOtherError(
        t('onboarding.profileCompletion.socialMedia.otherNameRequired' as any),
      );
      return;
    }
    if (isDuplicateCustomNetwork(custom, otherName)) {
      setOtherError(
        t('onboarding.profileCompletion.socialMedia.duplicateCustom' as any),
      );
      return;
    }
    const urlResult = normalizeCustomNetworkUrl(otherUrl);
    if (!urlResult.ok || !urlResult.url) {
      setOtherError(
        t('onboarding.profileCompletion.socialMedia.otherUrlRequired' as any),
      );
      return;
    }
    onChangeCustom([
      ...custom,
      { name: otherName.trim(), url: urlResult.url },
    ]);
    onClearFieldError('custom');
    setOtherName('');
    setOtherUrl('');
    setOtherError(null);
    setOtherOpen(false);
  }

  return (
    <View>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        {t('onboarding.profileCompletion.socialMedia.title' as any)}
      </Text>
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
        {t('onboarding.profileCompletion.socialMedia.subtitle' as any)}
      </Text>
      <Text style={[styles.count, { color: palette.chipText }]}>
        {connectedLabel}
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.surface,
            borderColor: palette.accentBorder,
          },
        ]}
      >
        {CRJ_SOCIAL_PLATFORMS.map((platform) => {
          const error = fieldErrors[platform.id];
          const label = t(
            `onboarding.profileCompletion.socialMedia.platforms.${platform.nameKey}` as any,
          );
          return (
            <View key={platform.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <PlatformGlyph platform={platform} glyphColor="#FFFFFF" />
                <Text style={[styles.platformName, { color: palette.textPrimary }]}>
                  {label}
                </Text>
              </View>
              <TextInput
                value={values[platform.id]}
                onChangeText={(text) => setValue(platform.id, text)}
                placeholder={t(
                  `onboarding.profileCompletion.socialMedia.placeholders.${platform.placeholderKey}` as any,
                )}
                placeholderTextColor={palette.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                keyboardType="url"
                textContentType="URL"
                accessibilityLabel={t(
                  'onboarding.profileCompletion.socialMedia.inputA11y' as any,
                  { name: label },
                )}
                style={[
                  styles.input,
                  inputStyle,
                  error ? { borderColor: palette.danger } : null,
                ]}
              />
              {error ? (
                <Text style={[styles.error, { color: palette.danger }]}>
                  {error}
                </Text>
              ) : null}
            </View>
          );
        })}

        {custom.map((row, index) => (
          <View key={`${row.name}-${index}`} style={styles.row}>
            <View style={styles.rowHeader}>
              <View
                style={[
                  styles.glyph,
                  { backgroundColor: '#64748B' },
                ]}
              >
                <Ionicons name="globe-outline" size={14} color="#FFFFFF" />
              </View>
              <Text
                style={[
                  styles.platformName,
                  { color: palette.textPrimary, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {row.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  'onboarding.profileCompletion.socialMedia.removeA11y' as any,
                  { name: row.name },
                )}
                hitSlop={8}
                onPress={() => {
                  onChangeCustom(custom.filter((_, i) => i !== index));
                }}
                style={styles.removeHit}
              >
                <Text style={[styles.removeMark, { color: palette.textMuted }]}>
                  {'\u00D7'}
                </Text>
              </Pressable>
            </View>
            {row.url ? (
              <Text
                style={[styles.customUrl, { color: palette.textSecondary }]}
                numberOfLines={2}
              >
                {row.url}
              </Text>
            ) : null}
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            'onboarding.profileCompletion.socialMedia.other' as any,
          )}
          onPress={() => {
            setOtherOpen((open) => !open);
            setOtherError(null);
          }}
          style={[
            styles.otherToggle,
            { borderColor: palette.accentBorder },
          ]}
        >
          <Text style={[styles.otherToggleText, { color: palette.textSecondary }]}>
            {'＋ '}
            {t('onboarding.profileCompletion.socialMedia.other' as any)}
          </Text>
        </Pressable>

        {otherOpen ? (
          <View
            style={[
              styles.otherPanel,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.accentBorder,
              },
            ]}
          >
            <View style={styles.rowHeader}>
              <View style={[styles.glyph, { backgroundColor: '#64748B' }]}>
                <Ionicons name="globe-outline" size={14} color="#FFFFFF" />
              </View>
              <TextInput
                value={otherName}
                onChangeText={(text) => {
                  setOtherName(text.slice(0, CUSTOM_NETWORK_NAME_MAX));
                  setOtherError(null);
                }}
                placeholder={t(
                  'onboarding.profileCompletion.socialMedia.otherNamePlaceholder' as any,
                )}
                placeholderTextColor={palette.placeholder}
                accessibilityLabel={t(
                  'onboarding.profileCompletion.socialMedia.otherNamePlaceholder' as any,
                )}
                style={[
                  styles.input,
                  inputStyle,
                  { flex: 1, marginTop: 0 },
                ]}
              />
            </View>
            <TextInput
              value={otherUrl}
              onChangeText={(text) => {
                setOtherUrl(text);
                setOtherError(null);
              }}
              placeholder={t(
                'onboarding.profileCompletion.socialMedia.otherUrlPlaceholder' as any,
              )}
              placeholderTextColor={palette.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel={t(
                'onboarding.profileCompletion.socialMedia.otherUrlPlaceholder' as any,
              )}
              style={[styles.input, inputStyle]}
            />
            {otherError ? (
              <Text style={[styles.error, { color: palette.danger }]}>
                {otherError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !otherReady }}
              onPress={addOther}
              style={[
                styles.addNetwork,
                {
                  backgroundColor: otherReady ? palette.primary : 'transparent',
                  borderColor: otherReady ? 'transparent' : palette.accentBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.addNetworkText,
                  {
                    color: otherReady ? '#FFFFFF' : palette.textMuted,
                  },
                ]}
              >
                {t(
                  'onboarding.profileCompletion.socialMedia.addNetwork' as any,
                )}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 25,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  count: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
  },
  card: {
    marginTop: spacing.lg,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 14,
  },
  row: {
    gap: 7,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  glyph: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  platformName: {
    fontSize: 13.5,
    fontWeight: fontWeight.extrabold,
  },
  input: {
    width: '100%',
    marginTop: 7,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    minHeight: 44,
  },
  error: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    marginTop: 4,
  },
  customUrl: {
    fontSize: fontSize.sm,
    marginTop: 6,
  },
  removeHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMark: {
    fontSize: 20,
    fontWeight: fontWeight.extrabold,
    lineHeight: 22,
  },
  otherToggle: {
    minHeight: 44,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  otherToggleText: {
    fontSize: 12.5,
    fontWeight: fontWeight.bold,
  },
  otherPanel: {
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  addNetwork: {
    marginTop: 11,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  addNetworkText: {
    fontSize: 12.5,
    fontWeight: fontWeight.extrabold,
  },
});
