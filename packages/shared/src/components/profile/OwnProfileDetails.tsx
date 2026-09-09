import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FormInput } from '../registration/FormInput';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { cardShadow } from '../../theme/shadows';
import type { ProfileModeValue } from '../ModeSwitch';

export type OwnProfileDetailsValues = {
  realName: string;
  lastName: string;
  occupation: string;
  bio: string;
  company: string;
};

type FieldLabels = {
  sectionTitle: string;
  realName: string;
  lastName: string;
  occupation: string;
  biography: string;
  company: string;
};

type FieldPlaceholders = {
  realName: string;
  lastName: string;
  occupation: string;
  biography: string;
  company: string;
};

type Props = {
  mode: ProfileModeValue;
  values: OwnProfileDetailsValues;
  labels: FieldLabels;
  placeholders: FieldPlaceholders;
  editorWritable: boolean;
  bioMaxLength: number;
  onChangeRealName: (value: string) => void;
  onChangeLastName: (value: string) => void;
  onChangeOccupation: (value: string) => void;
  onChangeBio: (value: string) => void;
  onChangeCompany: (value: string) => void;
  realNameMaxLength: number;
  lastNameMaxLength: number;
  occupationMaxLength: number;
  companyMaxLength: number;
};

export default function OwnProfileDetails({
  mode,
  values,
  labels,
  placeholders,
  editorWritable,
  bioMaxLength,
  onChangeRealName,
  onChangeLastName,
  onChangeOccupation,
  onChangeBio,
  onChangeCompany,
  realNameMaxLength,
  lastNameMaxLength,
  occupationMaxLength,
  companyMaxLength,
}: Props) {
  const { palette } = useAppTheme();
  const editable = editorWritable;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
        cardShadow,
      ]}
    >
      <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
        {labels.sectionTitle}
      </Text>

      <View style={styles.stack}>
        <FormInput
          label={labels.realName}
          placeholder={placeholders.realName}
          value={values.realName}
          onChangeText={onChangeRealName}
          editable={editable}
          maxLength={realNameMaxLength}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          textContentType="givenName"
        />
        <FormInput
          label={labels.lastName}
          placeholder={placeholders.lastName}
          value={values.lastName}
          onChangeText={onChangeLastName}
          editable={editable}
          maxLength={lastNameMaxLength}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          textContentType="familyName"
        />
        <FormInput
          label={labels.occupation}
          placeholder={placeholders.occupation}
          value={values.occupation}
          onChangeText={onChangeOccupation}
          editable={editable}
          maxLength={occupationMaxLength}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />
        {mode === 'professional' ? (
          <FormInput
            label={labels.company}
            placeholder={placeholders.company}
            value={values.company}
            onChangeText={onChangeCompany}
            editable={editable}
            maxLength={companyMaxLength}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        ) : null}
        <View>
          <FormInput
            label={labels.biography}
            placeholder={placeholders.biography}
            value={values.bio}
            onChangeText={onChangeBio}
            editable={editable}
            maxLength={bioMaxLength}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={styles.bioInput}
            autoCapitalize="sentences"
            returnKeyType="done"
          />
          <Text style={[styles.counter, { color: palette.textMuted }]}>
            {values.bio.length}/{bioMaxLength}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: screenPadding.horizontal,
    marginTop: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  stack: {
    gap: spacing.md,
  },
  bioInput: {
    minHeight: 112,
    paddingTop: spacing.md,
  },
  counter: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    textAlign: 'right',
    fontWeight: fontWeight.medium,
  },
});
