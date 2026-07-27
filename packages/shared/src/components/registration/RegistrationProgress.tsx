import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { fontSize, fontWeight } from '../../theme/typography';

interface Props {
  /** 0–1 */
  progress: number;
  stepLabel: string;
}

/** Progress track + step label (nearsy-rn-v3 ProgressBar). */
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  track: { flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
