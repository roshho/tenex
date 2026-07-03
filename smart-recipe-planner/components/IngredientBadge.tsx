import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../constants/theme';

interface Props {
  label: string;
}

export default function IngredientBadge({ label }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primaryLight + '55',
  },
  text: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});
