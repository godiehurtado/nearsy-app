/**
 * Shared affiliation logo mark — CRJ selected-entity visual (square + rounded).
 * No search, selection, Logo.dev, or wizard state.
 */
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { fontWeight, useAppTheme } from '../theme';
import {
  AFFILIATION_SELECTED_LOGO_RADIUS,
  AFFILIATION_SELECTED_LOGO_SIZE,
  asOnboardingAffiliationCategoryId,
  resolveAffiliationLogoPresentation,
} from '../affiliations/affiliationLogo';

export type AffiliationLogoMarkProps = {
  name: string;
  /** Optional CRJ category id or Discovery `type`; used only for emoji fallback. */
  type?: string | null;
  logoUrl?: string | null;
  size?: number;
  borderRadius?: number;
};

export function AffiliationLogoMark({
  name,
  type = null,
  logoUrl = null,
  size = AFFILIATION_SELECTED_LOGO_SIZE,
  borderRadius = AFFILIATION_SELECTED_LOGO_RADIUS,
}: AffiliationLogoMarkProps) {
  const { palette } = useAppTheme();
  const [remoteFailed, setRemoteFailed] = useState(false);

  const presentation = resolveAffiliationLogoPresentation({
    name,
    categoryId: asOnboardingAffiliationCategoryId(type),
    logoUrl: remoteFailed ? null : logoUrl,
  });

  if (presentation.kind === 'remote' && presentation.logoUrl) {
    return (
      <Image
        source={{ uri: presentation.logoUrl }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        onError={() => setRemoteFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: palette.chipBg,
        }}
      />
    );
  }

  if (presentation.kind === 'initials') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: presentation.avatarColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityRole="image"
        accessibilityLabel={name}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: size * 0.32,
            fontWeight: fontWeight.extrabold,
            letterSpacing: -0.4,
          }}
        >
          {presentation.initials}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        backgroundColor: palette.chipBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      <Text style={{ fontSize: size * 0.36 }}>{presentation.emoji ?? '🏷️'}</Text>
    </View>
  );
}
