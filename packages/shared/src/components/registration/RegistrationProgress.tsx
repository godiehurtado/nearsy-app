import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { radius } from '../../theme/radius.ts';
import { fontSize, fontWeight } from '../../theme/typography.ts';

interface Props {
  /** 0–1 */
  progress: number;
  /** Optional n/N label — CRJ 2.0 uses soft progress without counts. */
  stepLabel?: string;
}

/** Progress track + optional step label. */
export function RegistrationProgress({ progress, stepLabel }: Props) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.track, { backgroundColor: palette.border }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              backgroundColor: palette.primary,
            },
          ]}
        />
      </View>
      {stepLabel ? (
        <Text
          style={{
            color: palette.textMuted,
            fontSize: fontSize.sm,
            fontWeight: fontWeight.extrabold,
            minWidth: 26,
            textAlign: 'right',
          }}
        >
          {stepLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  track: { flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
