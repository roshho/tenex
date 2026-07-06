import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { fetchFullRecipe } from '../lib/api';
import { colors, spacing, radius, typography } from '../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RecipeDetail'>;
  route: RouteProp<RootStackParamList, 'RecipeDetail'>;
};

export default function RecipeDetailScreen({ navigation, route }: Props) {
  const { recipeId } = route.params;

  const { data: recipe, isLoading, isError, refetch } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => fetchFullRecipe(recipeId),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Building your recipe…</Text>
      </View>
    );
  }

  if (isError || !recipe) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load recipe.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {recipe.imageUrl && <Image source={{ uri: recipe.imageUrl }} style={styles.heroImage} />}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{recipe.title}</Text>
        <Text style={styles.description}>{recipe.description}</Text>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <MetaTile label="Prep" value={`${recipe.prepTime}m`} />
        <MetaTile label="Cook" value={`${recipe.cookTime}m`} />
        <MetaTile label="Serves" value={String(recipe.servings)} />
        <MetaTile label="Level" value={recipe.difficulty} />
      </View>

      {/* Ingredients */}
      <SectionHeader title="Ingredients" />
      <View style={styles.card}>
        {recipe.ingredients.map((ing, i) => (
          <View key={i} style={[styles.ingredientRow, i < recipe.ingredients.length - 1 && styles.rowBorder]}>
            <Text style={styles.ingredientName}>{ing.name}</Text>
            <Text style={styles.ingredientQty}>
              {ing.quantity}{ing.unit ? ` ${ing.unit}` : ''}
            </Text>
          </View>
        ))}
      </View>

      {/* Steps */}
      <SectionHeader title="Instructions" />
      <View style={styles.stepsContainer}>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Tips */}
      {recipe.tips ? (
        <>
          <SectionHeader title="Chef's Tips" />
          <View style={[styles.card, styles.tipsCard]}>
            <Text style={styles.tipsText}>{recipe.tips}</Text>
          </View>
        </>
      ) : null}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaTile}>
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  heroImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.surfaceAlt,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  retryButtonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  header: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.text,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  metaValue: {
    ...typography.h3,
    color: colors.primary,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ingredientName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  ingredientQty: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  stepsContainer: {
    marginHorizontal: spacing.md,
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    ...typography.label,
    color: colors.primary,
  },
  stepText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingTop: 3,
  },
  tipsCard: {
    padding: spacing.md,
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryLight,
  },
  tipsText: {
    ...typography.body,
    color: colors.primary,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
