import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppUpdateMandatoryState } from './appUpdateHost.ts';

/**
 * Blocking surface for a validated mandatory policy. Rendered only while the
 * session reports `mandatory`; the session removes it (fail open) as soon as
 * the policy is expired / invalid / satisfied, so it never stays up on its own.
 * Hardware back is swallowed while visible.
 */
export function AppUpdateMandatoryModal({
  state,
}: {
  state: AppUpdateMandatoryState | null;
}) {
  return (
    <Modal
      visible={state != null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{state?.copy.title}</Text>
          <Text style={styles.message}>{state?.copy.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={state?.onUpdate}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{state?.copy.update}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111111' },
  message: { marginTop: 12, fontSize: 15, color: '#333333', lineHeight: 21 },
  button: {
    marginTop: 20,
    borderRadius: 10,
    backgroundColor: '#3B5A85',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
