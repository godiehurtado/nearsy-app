import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { spacing } from '../../theme/spacing.ts';
import { useTranslation } from '../../i18n/index.ts';
import {
  VISIBLE_CRJ_SOCIAL_PLATFORMS,
  countConnectedSocials,
  type CrjSocialDraftValues,
  type CrjSocialPlatformId,
} from '../../social/onboardingSocialCatalog.ts';
import type { CrjSocialFieldErrors } from '../../social/socialLinkNormalize.ts';
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import {
  ANDROID_OWNERSHIP_CARD_IDS,
  applyOwnershipVerifiedChange,
  type AndroidOwnershipCardId,
} from '../../social/postCrjSocialEditor.ts';
import {
  isManualSocialLinkId,
  type ManualSocialLinkId,
} from '../../social/manualSocialLinkCard.ts';
import { YoutubeOwnershipCard } from '../profile/YoutubeOwnershipCard.tsx';
import { TiktokOwnershipCard } from '../profile/TiktokOwnershipCard.tsx';
import { InstagramOwnershipCard } from '../profile/InstagramOwnershipCard.tsx';
import { XOwnershipCard } from '../profile/XOwnershipCard.tsx';
import { ManualSocialLinkCard } from '../profile/ManualSocialLinkCard.tsx';
import { ManualSocialLinkModal } from '../profile/ManualSocialLinkModal.tsx';
import {
  SocialPlatformGlyph,
  WEBSITE_SOCIAL_PLATFORM,
} from '../profile/SocialPlatformGlyph.tsx';
import { useManualSocialLinks } from '../profile/useManualSocialLinks.ts';

type Props = {
  uid: string | null;
  mode: ProfileMode;
  values: CrjSocialDraftValues;
  website?: string;
  /** A link was written; the wizard only updates its own draft. */
  onManualLinkSaved: (field: ManualSocialLinkId, url: string | null) => void;
  /** Next and Skip wait: their write could otherwise undo a removal in flight. */
  onManualBusyChange: (busy: boolean) => void;
  fieldErrors: CrjSocialFieldErrors;
  onClearFieldError: (id: CrjSocialPlatformId) => void;
};

export function OnboardingSocialMediaStep({
  uid,
  mode,
  values,
  website = '',
  onManualLinkSaved,
  onManualBusyChange,
  fieldErrors,
  onClearFieldError,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [ownershipVerified, setOwnershipVerified] = useState<
    Partial<Record<AndroidOwnershipCardId, boolean>>
  >({});

  const manualLinks = useManualSocialLinks({
    uid,
    mode,
    values: {
      facebook: values.facebook ?? '',
      linkedin: values.linkedin ?? '',
      website,
    },
    onSaved: (field, url) => {
      if (field !== 'website') onClearFieldError(field);
      onManualLinkSaved(field, url);
    },
  });

  const manualBusy = manualLinks.busy;
  useEffect(() => {
    onManualBusyChange(manualBusy);
  }, [manualBusy, onManualBusyChange]);

  const onOwnershipConnectedChange = useCallback(
    (id: AndroidOwnershipCardId, connected: boolean) => {
      setOwnershipVerified((prev) =>
        applyOwnershipVerifiedChange(prev, id, connected),
      );
    },
    [],
  );

  const urlValuesForCount =
    Platform.OS === 'android'
      ? {
          ...values,
          youtube: '',
          tiktok: '',
          instagram: '',
          x: '',
        }
      : values;
  // Historical custom links stay stored, but are neither shown nor counted here.
  const connected =
    countConnectedSocials(urlValuesForCount, [], website) +
    (Platform.OS === 'android'
      ? ANDROID_OWNERSHIP_CARD_IDS.filter((id) => ownershipVerified[id]).length
      : 0);
  const connectedLabel =
    connected === 1
      ? t('onboarding.profileCompletion.socialMedia.connectedOne' as any)
      : t('onboarding.profileCompletion.socialMedia.connected' as any, {
          count: connected,
        });

  const manualCard = (
    id: ManualSocialLinkId,
    label: string,
    url: string,
    glyph: React.ReactNode,
    fieldError?: string,
  ) => (
    <ManualSocialLinkCard
      key={id}
      id={id}
      label={label}
      url={url}
      glyph={glyph}
      disabled={manualLinks.busy}
      removing={manualLinks.busyField === id}
      error={manualLinks.errorFor(id) ?? fieldError}
      onOpen={() => manualLinks.open(id)}
      onRemove={() => manualLinks.remove(id)}
    />
  );

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

      <View style={styles.cards}>
        {VISIBLE_CRJ_SOCIAL_PLATFORMS.map((platform) => {
          const label = t(
            `onboarding.profileCompletion.socialMedia.platforms.${platform.nameKey}` as any,
          );
          const glyph = <SocialPlatformGlyph platform={platform} />;

          if (Platform.OS === 'android' && platform.id === 'youtube') {
            return (
              <YoutubeOwnershipCard
                key={`youtube-${mode}`}
                mode={mode}
                label={label}
                legacyUrl={values.youtube}
                onConnectedChange={(connectedState) =>
                  onOwnershipConnectedChange('youtube', connectedState)
                }
                glyph={glyph}
              />
            );
          }
          if (Platform.OS === 'android' && platform.id === 'tiktok') {
            return (
              <TiktokOwnershipCard
                key={`tiktok-${mode}`}
                mode={mode}
                label={label}
                legacyUrl={values.tiktok}
                onConnectedChange={(connectedState) =>
                  onOwnershipConnectedChange('tiktok', connectedState)
                }
                glyph={glyph}
              />
            );
          }
          if (Platform.OS === 'android' && platform.id === 'instagram') {
            return (
              <InstagramOwnershipCard
                key={`instagram-${mode}`}
                mode={mode}
                label={label}
                legacyUrl={values.instagram}
                onConnectedChange={(connectedState) =>
                  onOwnershipConnectedChange('instagram', connectedState)
                }
                glyph={glyph}
              />
            );
          }
          if (Platform.OS === 'android' && platform.id === 'x') {
            return (
              <XOwnershipCard
                key={`x-${mode}`}
                mode={mode}
                label={label}
                legacyUrl={values.x}
                onConnectedChange={(connectedState) =>
                  onOwnershipConnectedChange('x', connectedState)
                }
                glyph={glyph}
              />
            );
          }
          if (isManualSocialLinkId(platform.id)) {
            return manualCard(
              platform.id,
              label,
              values[platform.id] ?? '',
              glyph,
              fieldErrors[platform.id],
            );
          }
          return null;
        })}

        {manualCard(
          'website',
          t('onboarding.profileCompletion.socialMedia.platforms.website' as any),
          website,
          <SocialPlatformGlyph platform={WEBSITE_SOCIAL_PLATFORM} />,
        )}
      </View>
      <ManualSocialLinkModal {...manualLinks.modalProps} />
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
  cards: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
});
