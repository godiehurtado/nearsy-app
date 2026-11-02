import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { fontSize, fontWeight } from '../../theme/typography';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import {
  copyInstagramChallengeCode,
  isCopyInstagramChallengeFailure,
  shareInstagramChallengeCode,
} from './copyChallenge';

type Props = {
  code: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  surfaceColor: string;
};

/**
 * Copy writes the clipboard. Share is shown only when expo-clipboard is
 * unavailable, and is never reported as a successful copy.
 */
export function InstagramChallengeCopyControls({
  code,
  textColor,
  mutedColor,
  borderColor,
  surfaceColor,
}: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState(false);

  const handleCopy = useCallback(() => {
    void copyInstagramChallengeCode(code).then((result) => {
      if (isCopyInstagramChallengeFailure(result)) {
        setCopied(false);
        setShareFallback(result.reason === 'native-module-unavailable');
        return;
      }
      setCopied(true);
      setShareFallback(false);
    });
  }, [code]);

  const handleShare = useCallback(() => {
    void shareInstagramChallengeCode(code);
  }, [code]);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.social.instagram.shareCodeA11y')}
        onPress={handleCopy}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: surfaceColor, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.btnText, { color: textColor }]}>
          {copied
            ? t('profile.social.copied')
            : t('profile.social.instagram.shareCode')}
        </Text>
      </Pressable>
      {shareFallback ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.social.instagram.shareSheetA11y')}
            onPress={handleShare}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: surfaceColor, borderColor },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.btnText, { color: textColor }]}>
              {t('profile.social.instagram.shareSheet')}
            </Text>
          </Pressable>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.helper, { color: mutedColor }]}
          >
            {t('profile.social.instagram.clipboardUnavailable')}
          </Text>
        </>
      ) : copied ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.helper, { color: mutedColor }]}
        >
          {t('profile.social.copied')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  btn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  btnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  helper: {
    fontSize: fontSize.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
