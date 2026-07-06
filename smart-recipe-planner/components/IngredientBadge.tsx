import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../constants/theme';

interface Props {
  label: string;
  onRemove?: () => void;
}

export default function IngredientBadge({ label, onRemove }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.removeButton}>
          <Text style={styles.removeText}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
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
  removeButton: {
    marginLeft: spacing.xs,
  },
  removeText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '700',
  },
});
