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
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useTranslation } from '../../i18n';
import type { SocialCustomLink } from '../../types/profile';
import type { ProfileMode } from '../../profile/profileModeFields';
import {
  CUSTOM_NETWORK_NAME_MAX,
  CRJ_MANUAL_URL_SOCIAL_PLATFORMS,
  countConnectedSocials,
  type CrjSocialDraftValues,
  type CrjSocialPlatform,
  type CrjSocialPlatformId,
} from '../../social/onboardingSocialCatalog';
import { OwnedSocialConnectSection } from './OwnedSocialConnectSection';
import {
  isDuplicateCustomNetwork,
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
  type CrjSocialFieldErrors,
  validateCustomNetworkName,
} from '../../social/socialLinkNormalize';
import { SocialConnectionModal } from '../social/SocialConnectionModal';

type ManualSheetId = 'facebook' | 'linkedin' | 'website';

type Props = {
  uid: string;
  mode: ProfileMode;
  values: CrjSocialDraftValues;
  website: string;
  custom: SocialCustomLink[];
  onChangeValues: (next: CrjSocialDraftValues) => void;
  onChangeWebsite: (next: string) => void;
  onChangeCustom: (next: SocialCustomLink[]) => void;
  onPersistManual: (
    nextValues: CrjSocialDraftValues,
    nextWebsite: string,
  ) => Promise<void>;
  fieldErrors: CrjSocialFieldErrors;
  onClearFieldError: (id: CrjSocialPlatformId | 'custom' | 'website') => void;
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
  uid,
  mode,
  values,
  website,
  custom,
  onChangeValues,
  onChangeWebsite,
  onChangeCustom,
  onPersistManual,
  fieldErrors,
  onClearFieldError,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherUrl, setOtherUrl] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);
  const [ownedCount, setOwnedCount] = useState(0);
  const [manualSheet, setManualSheet] = useState<ManualSheetId | null>(null);
  const [manualDraft, setManualDraft] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);

  const connected =
    countConnectedSocials(values, custom) +
    ownedCount +
    (website.trim() ? 1 : 0);
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

  function openManualSheet(id: ManualSheetId) {
    setManualSheet(id);
    setManualDraft(id === 'website' ? website : values[id]);
    setManualError(null);
  }

  async function saveManualSheet() {
    if (!manualSheet || manualSaving) return;
    const raw = manualDraft.trim();
    const result =
      manualSheet === 'website'
        ? normalizeCustomNetworkUrl(raw)
        : normalizeSocialInput(manualSheet, raw);
    if (!raw || !result.ok || !result.url) {
      setManualError(
        t('onboarding.profileCompletion.socialMedia.invalid' as any),
      );
      return;
    }
    const nextValues =
      manualSheet === 'website'
        ? values
        : { ...values, [manualSheet]: result.url };
    const nextWebsite = manualSheet === 'website' ? result.url : website;
    setManualSaving(true);
    try {
      if (manualSheet === 'website') {
        onChangeWebsite(nextWebsite);
        onClearFieldError('website');
      } else {
        onChangeValues(nextValues);
        onClearFieldError(manualSheet);
      }
      await onPersistManual(nextValues, nextWebsite);
      setManualSheet(null);
    } finally {
      setManualSaving(false);
    }
  }

  async function clearManual(id: ManualSheetId) {
    const nextValues =
      id === 'website' ? values : { ...values, [id]: '' };
    const nextWebsite = id === 'website' ? '' : website;
    if (id === 'website') {
      onChangeWebsite('');
      onClearFieldError('website');
    } else {
      onChangeValues(nextValues);
      onClearFieldError(id);
    }
    await onPersistManual(nextValues, nextWebsite);
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

      <OwnedSocialConnectSection
        uid={uid}
        mode={mode}
        onOwnedCountChange={setOwnedCount}
      />

      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.surface,
            borderColor: palette.accentBorder,
          },
        ]}
      >
        {CRJ_MANUAL_URL_SOCIAL_PLATFORMS.map((platform) => {
          const error = fieldErrors[platform.id];
          const label = t(
            `onboarding.profileCompletion.socialMedia.platforms.${platform.nameKey}` as any,
          );
          const filled = (values[platform.id] ?? '').trim().length > 0;
          return (
            <View key={platform.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <PlatformGlyph platform={platform} glyphColor="#FFFFFF" />
                <Text style={[styles.platformName, { color: palette.textPrimary }]}>
                  {label}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    filled
                      ? void clearManual(platform.id as ManualSheetId)
                      : openManualSheet(platform.id as ManualSheetId)
                  }
                  style={styles.manualAction}
                >
                  <Text style={{ color: filled ? palette.danger : palette.primary }}>
                    {filled
                      ? t('profile.social.disconnect')
                      : t('profile.social.connect')}
                  </Text>
                </Pressable>
              </View>
              {filled ? (
                <Text style={[styles.helper, { color: palette.textSecondary }]}>
                  {values[platform.id]}
                </Text>
              ) : null}
              {error ? (
                <Text style={[styles.error, { color: palette.danger }]}>
                  {error}
                </Text>
              ) : null}
            </View>
          );
        })}

        {(() => {
          const label = t(
            'onboarding.profileCompletion.socialMedia.platforms.website' as any,
          );
          const filled = website.trim().length > 0;
          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <View style={[styles.glyph, { backgroundColor: '#64748B' }]}>
                  <Ionicons name="globe-outline" size={14} color="#FFFFFF" />
                </View>
                <Text style={[styles.platformName, { color: palette.textPrimary }]}>
                  {label}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    filled ? void clearManual('website') : openManualSheet('website')
                  }
                  style={styles.manualAction}
                >
                  <Text style={{ color: filled ? palette.danger : palette.primary }}>
                    {filled
                      ? t('profile.social.disconnect')
                      : t('profile.social.connect')}
                  </Text>
                </Pressable>
              </View>
              {filled ? (
                <Text style={[styles.helper, { color: palette.textSecondary }]}>
                  {website}
                </Text>
              ) : null}
            </View>
          );
        })()}

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
      <SocialConnectionModal
        visible={manualSheet !== null}
        title={
          manualSheet
            ? t(`profile.social.connectModal.${manualSheet}.title` as any)
            : ''
        }
        body={
          manualSheet
            ? t(`profile.social.connectModal.${manualSheet}.body` as any)
            : ''
        }
        headerIcon={
          manualSheet && manualSheet !== 'website' ? (
            <PlatformGlyph
              platform={
                CRJ_MANUAL_URL_SOCIAL_PLATFORMS.find((p) => p.id === manualSheet)!
              }
              glyphColor="#FFFFFF"
            />
          ) : manualSheet === 'website' ? (
            <View
              style={[
                styles.glyph,
                {
                  backgroundColor: palette.chipBg,
                  borderColor: palette.border,
                },
              ]}
            >
              <Ionicons name="globe-outline" size={12} color={palette.chipText} />
            </View>
          ) : undefined
        }
        primaryLabel={t('profile.social.saveLink')}
        primaryA11y={
          manualSheet
            ? t('profile.social.saveLinkA11y', {
                platform: t(
                  `onboarding.profileCompletion.socialMedia.platforms.${manualSheet}` as any,
                ),
              })
            : undefined
        }
        primaryBusy={manualSaving}
        onPrimary={() => {
          void saveManualSheet();
        }}
        onRequestClose={() => {
          if (manualSaving) return;
          setManualSheet(null);
          setManualError(null);
        }}
      >
        {manualSheet ? (
          <>
            <TextInput
              value={manualDraft}
              onChangeText={(text) => {
                setManualDraft(text);
                setManualError(null);
              }}
              placeholder={t(
                `onboarding.profileCompletion.socialMedia.placeholders.${manualSheet}` as any,
              )}
              placeholderTextColor={palette.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="url"
              textContentType="URL"
              accessibilityLabel={t(
                'onboarding.profileCompletion.socialMedia.inputA11y' as any,
                {
                  name: t(
                    `onboarding.profileCompletion.socialMedia.platforms.${manualSheet}` as any,
                  ),
                },
              )}
              style={[
                styles.input,
                inputStyle,
                manualError ? { borderColor: palette.danger } : null,
              ]}
            />
            {manualError ? (
              <Text style={[styles.error, { color: palette.danger }]}>
                {manualError}
              </Text>
            ) : null}
          </>
        ) : null}
      </SocialConnectionModal>
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
    flex: 1,
  },
  helper: {
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  manualAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
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
