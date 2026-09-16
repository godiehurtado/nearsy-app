import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  onSkip?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  showBack?: boolean;
  showNext?: boolean;
  nextLabel?: string;
  skipLabel?: string;
};

export default function GuideOnboardingCard({
  stepIndex,
  totalSteps,
  title,
  description,
  onSkip,
  onBack,
  onNext,
  showBack = false,
  showNext = true,
  nextLabel = 'Next',
  skipLabel = 'Skip guide',
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {stepIndex + 1}/{totalSteps}
          </Text>
        </View>
        {onSkip ? (
          <TouchableOpacity onPress={onSkip} activeOpacity={0.85}>
            <Text style={styles.skip}>{skipLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {(showBack || showNext) && (
        <View style={styles.actionsRow}>
          {showBack ? (
            <TouchableOpacity
              style={[styles.navButton, stepIndex === 0 && styles.navButtonDisabled]}
              onPress={onBack}
              disabled={stepIndex === 0}
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navSpacer} />
          )}

          {showNext && onNext ? (
            <TouchableOpacity
              style={styles.navButtonPrimary}
              onPress={onNext}
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonPrimaryText}>{nextLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#EEF4FA',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ADCBE3',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#3B5A85',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  skip: {
    color: '#3B5A85',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  navSpacer: {
    flex: 1,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
  },
  navButtonPrimary: {
    flex: 1,
    backgroundColor: '#3B5A85',
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
  },
  navButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
