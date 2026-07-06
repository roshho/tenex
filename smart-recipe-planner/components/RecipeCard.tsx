import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { RecipeStub } from '../types';
import { colors, spacing, radius, typography, shadows } from '../constants/theme';

interface Props {
  stub: RecipeStub;
  onPress: () => void;
}

const difficultyColor = {
  Easy: colors.primary,
  Medium: colors.accent,
  Hard: colors.error,
};

const MAX_INGREDIENT_CHIPS = 3;

export default function RecipeCard({ stub, onPress }: Props) {
  const totalTime = stub.prepTime + stub.cookTime;
  const shownIngredients = stub.matchedIngredients.slice(0, MAX_INGREDIENT_CHIPS);
  const overflowCount = stub.matchedIngredients.length - shownIngredients.length;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.imageWrap}>
        {stub.imageUrl ? (
          <Image source={{ uri: stub.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imageFallback]} />
        )}
        <View style={styles.cuisineChip}>
          <Text style={styles.cuisineChipText}>{stub.cuisine}</Text>
        </View>
        <View style={styles.difficultyChip}>
          <Text style={[styles.difficultyChipText, { color: difficultyColor[stub.difficulty] }]}>
            {stub.difficulty}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{stub.title}</Text>
        <Text style={styles.description} numberOfLines={2}>{stub.description}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{totalTime} min</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{stub.servings} servings</Text>
        </View>

        {shownIngredients.length > 0 && (
          <View style={styles.chipsRow}>
            {shownIngredients.map((ing) => (
              <View key={ing} style={styles.ingredientChip}>
                <Text style={styles.ingredientChipText} numberOfLines={1}>{ing}</Text>
              </View>
            ))}
            {overflowCount > 0 && (
              <View style={styles.ingredientChip}>
                <Text style={styles.ingredientChipText}>+{overflowCount}</Text>
              </View>
            )}
          </View>
        )}
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
    ...shadows.md,
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: colors.surfaceAlt,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cuisineChip: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.scrimStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  cuisineChipText: {
    ...typography.eyebrow,
    color: colors.white,
    letterSpacing: 0.4,
  },
  difficultyChip: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  difficultyChipText: {
    ...typography.label,
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.textMuted,
    marginHorizontal: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ingredientChip: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: 140,
  },
  ingredientChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
