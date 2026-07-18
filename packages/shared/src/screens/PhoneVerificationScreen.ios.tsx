// src/screens/PhoneVerificationScreen.ios.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';

export default function PhoneVerificationScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const goBack = () => navigation.goBack();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('authentication.otp.title')}</Text>
      <Text style={styles.subtitle}>{t('authentication.otp.subtitle')}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          Alert.alert(
            t('authentication.otp.comingSoonTitle'),
            t('authentication.otp.comingSoonMessage'),
          );
          goBack();
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>{t('authentication.otp.goBack')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    height: 48,
    borderRadius: 999,
    backgroundColor: '#3B5A85',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
