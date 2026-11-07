import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useTranslation } from '../../i18n';
import type { SocialCustomLink } from '../../types/profile';
import type { ProfileMode } from '../../profile/profileModeFields';
import {
  CRJ_MANUAL_URL_SOCIAL_PLATFORMS,
  countConnectedSocials,
  type CrjSocialDraftValues,
  type CrjSocialPlatform,
  type CrjSocialPlatformId,
} from '../../social/onboardingSocialCatalog';
import { MANUAL_SOCIAL_LINK_ORDER } from '../../social/manualSocialLinkCard';
import { OwnedSocialConnectSection } from './OwnedSocialConnectSection';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
  type CrjSocialFieldErrors,
} from '../../social/socialLinkNormalize';
import { ManualSocialLinkCard } from '../social/ManualSocialLinkCard';
import { SocialConnectionModal } from '../social/SocialConnectionModal';

type ManualSheetId = 'facebook' | 'linkedin' | 'website';

type Props = {
  uid: string;
  mode: ProfileMode;
  onVerifiedPlatformsChange?: (platforms: readonly string[] | null) => void;
  values: CrjSocialDraftValues;
  website: string;
  /** Historical "Other network" links: kept by the caller, not shown in the CRJ. */
  custom: SocialCustomLink[];
  onChangeValues: (next: CrjSocialDraftValues) => void;
  onChangeWebsite: (next: string) => void;
  /** Unused since "Other network" left the CRJ; kept for the caller contract. */
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
  onVerifiedPlatformsChange,
  values,
  website,
  onChangeValues,
  onChangeWebsite,
  onPersistManual,
  fieldErrors,
  onClearFieldError,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [ownedCount, setOwnedCount] = useState(0);
  const [manualSheet, setManualSheet] = useState<ManualSheetId | null>(null);
  const [manualDraft, setManualDraft] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [removingId, setRemovingId] = useState<ManualSheetId | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // "Other network" is out of the approved CRJ scope: historical `custom`
  // links stay in the draft/persisted data untouched, but are neither shown
  // nor counted here.
  const connected =
    countConnectedSocials(values, []) +
    ownedCount +
    (website.trim() ? 1 : 0);
  const connectedLabel =
    connected === 1
      ? t('onboarding.profileCompletion.socialMedia.connectedOne' as any)
      : t('onboarding.profileCompletion.socialMedia.connected' as any, {
          count: connected,
        });

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
      if (mountedRef.current) setManualSheet(null);
    } finally {
      if (mountedRef.current) setManualSaving(false);
    }
  }

  async function clearManual(id: ManualSheetId) {
    if (removingId || manualSaving) return;
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
    setRemovingId(id);
    try {
      await onPersistManual(nextValues, nextWebsite);
    } finally {
      if (mountedRef.current) setRemovingId(null);
    }
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
        onOwnedPlatformsChange={onVerifiedPlatformsChange}
      />

      <View style={styles.manualCards}>
        {MANUAL_SOCIAL_LINK_ORDER.map((id) => {
          const label = t(
            `onboarding.profileCompletion.socialMedia.platforms.${id}` as any,
          );
          return (
            <ManualSocialLinkCard
              key={id}
              id={id}
              label={label}
              url={id === 'website' ? website : values[id] ?? ''}
              busy={manualSaving || removingId === id}
              error={id === 'website' ? fieldErrors.website : fieldErrors[id]}
              onOpenSheet={() => openManualSheet(id)}
              onRemove={() => void clearManual(id)}
            />
          );
        })}
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
  glyph: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
  manualCards: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
