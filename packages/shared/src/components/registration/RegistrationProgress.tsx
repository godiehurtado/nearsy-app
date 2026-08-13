import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';

interface Props {
  /** 0–1 visual fill only — never pair with n/N labels in CRJ. */
  progress: number;
}

/** Progress track without step counts (CRJ demo rule). */
export function RegistrationProgress({ progress }: Props) {
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  track: { flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
