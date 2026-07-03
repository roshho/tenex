import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RecipeStub } from '../types';
import { colors, spacing, radius, typography } from '../constants/theme';

interface Props {
  stub: RecipeStub;
  onPress: () => void;
}

const difficultyColor = {
  Easy: colors.primaryLight,
  Medium: colors.accent,
  Hard: colors.error,
};

export default function RecipeCard({ stub, onPress }: Props) {
  const totalTime = stub.prepTime + stub.cookTime;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{stub.title}</Text>
          <View style={[styles.difficultyBadge, { backgroundColor: difficultyColor[stub.difficulty] + '22' }]}>
            <Text style={[styles.difficultyText, { color: difficultyColor[stub.difficulty] }]}>
              {stub.difficulty}
            </Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={2}>{stub.description}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.metaGroup}>
          <Text style={styles.metaValue}>{totalTime}m</Text>
          <Text style={styles.metaLabel}>total</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metaGroup}>
          <Text style={styles.metaValue}>{stub.servings}</Text>
          <Text style={styles.metaLabel}>servings</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metaGroup}>
          <Text style={styles.metaValue}>{stub.cuisine}</Text>
          <Text style={styles.metaLabel}>cuisine</Text>
        </View>
        <View style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </View>
      </View>

      {/* Matched ingredients */}
      <View style={styles.matchedRow}>
        <Text style={styles.matchedLabel}>Uses: </Text>
        <Text style={styles.matchedIngredients} numberOfLines={1}>
          {stub.matchedIngredients.join(', ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  top: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  difficultyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  difficultyText: {
    ...typography.label,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  metaGroup: {
    alignItems: 'center',
    flex: 1,
  },
  metaValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  chevron: {
    paddingLeft: spacing.sm,
  },
  chevronText: {
    fontSize: 22,
    color: colors.textMuted,
  },
  matchedRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.primarySurface,
  },
  matchedLabel: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  matchedIngredients: {
    ...typography.bodySmall,
    color: colors.primary,
    flex: 1,
  },
});
