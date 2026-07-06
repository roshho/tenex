import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, RecipeStub } from '../types';
import { Cuisine } from '../constants/genres';
import { useRecipeStore } from '../store/recipeStore';
import { fetchMoreRecipes, updateIngredients } from '../lib/api';
import { showError } from '../lib/alert';
import RecipeCard from '../components/RecipeCard';
import IngredientBadge from '../components/IngredientBadge';
import GenreTagRow from '../components/GenreTagRow';
import { colors, spacing, radius, typography } from '../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RecipeList'>;
  route: RouteProp<RootStackParamList, 'RecipeList'>;
};

export default function RecipeListScreen({ navigation }: Props) {
  const {
    allStubs,
    ingredientSetId,
    detectedIngredients,
    selectedGenre,
    visibleStubs,
    filteredStubs,
    advance,
    canRefresh,
    selectGenre,
    appendStubs,
    removeIngredient,
    addIngredientOptimistic,
    mergeIngredientAdditionResult,
    reset,
  } = useRecipeStore();
  const recipes = visibleStubs();
  const availableCuisines = Array.from(new Set(allStubs.map(s => s.cuisine))) as Cuisine[];
  const [newIngredientText, setNewIngredientText] = useState('');
  const [isExhausted, setIsExhausted] = useState(false);

  // Cuisine tags are now built entirely from what's already in allStubs, so tapping one is
  // just a local filter — no network call, ever. Top-up (below) is what keeps the diverse
  // pool stocked; it never fetches "just this genre" anymore.
  const topUpMutation = useMutation({
    mutationFn: () =>
      fetchMoreRecipes({
        ingredientSetId: ingredientSetId!,
        excludeTitles: allStubs.map(s => s.title),
      }),
    onSuccess: (data) => {
      appendStubs(data.recipes);
      setIsExhausted(data.exhausted);
    },
    onError: (err) => {
      showError(
        'Something went wrong',
        `We couldn't find more recipes.\n\n${err.message}`,
        () => topUpMutation.mutate()
      );
    },
  });

  // The tag is added optimistically the moment the user hits "Add" (see
  // handleAddIngredient) — this mutation only resolves the background recipe
  // generation/lookup for the updated list and merges the results in once ready.
  const addIngredientMutation = useMutation({
    mutationFn: (updated: string[]) => updateIngredients(updated),
    onSuccess: (data) => {
      mergeIngredientAdditionResult(data.ingredientSetId, data.recipes);
      setIsExhausted(false);
    },
    onError: (err) => {
      showError('Something went wrong', `We couldn't find recipes for that ingredient.\n\n${err.message}`);
    },
  });

  const handleRefresh = () => {
    if (!canRefresh()) {
      if (selectedGenre) {
        // This cuisine is exhausted — there's no per-genre generation anymore, so the
        // useful action is to go back to the full list rather than a dead end.
        selectGenre(null);
        return;
      }
      if (!isExhausted && !topUpMutation.isPending) topUpMutation.mutate();
      return;
    }
    advance();
    if (!selectedGenre && !isExhausted) {
      const state = useRecipeStore.getState();
      const remaining = state.filteredStubs().length - (state.nextIndex + 5);
      if (remaining < 10 && !topUpMutation.isPending) {
        topUpMutation.mutate();
      }
    }
  };

  const handleSelectGenre = (genre: Cuisine | null) => {
    selectGenre(genre === selectedGenre ? null : genre);
  };

  const handleSelectRecipe = (stub: RecipeStub) => {
    navigation.navigate('RecipeDetail', { recipeId: stub.id, title: stub.title });
  };

  const handleNewPhoto = () => {
    reset();
    navigation.popToTop();
  };

  const handleAddIngredient = () => {
    const trimmed = newIngredientText.trim();
    if (!trimmed || detectedIngredients.includes(trimmed) || addIngredientMutation.isPending) return;
    setNewIngredientText('');
    const updated = [...detectedIngredients, trimmed];
    addIngredientOptimistic(trimmed); // tag appears immediately
    addIngredientMutation.mutate(updated); // recipes for it arrive in the background
  };

  const refreshLabel = canRefresh()
    ? 'Show 5 More'
    : selectedGenre
    ? 'Show All Recipes'
    : isExhausted
    ? "That's all for now"
    : topUpMutation.isPending
    ? 'Finding more…'
    : 'Get More Recipes';

  const refreshDisabled = topUpMutation.isPending || (!canRefresh() && !selectedGenre && isExhausted);

  return (
    <View style={styles.container}>
      {/* Detected ingredients strip */}
      <View style={styles.ingredientsSection}>
        <Text style={styles.ingredientsLabel}>Detected ingredients</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
          {detectedIngredients.map((ing) => (
            <IngredientBadge key={ing} label={ing} onRemove={() => removeIngredient(ing)} />
          ))}
        </ScrollView>
        <View style={styles.addIngredientRow}>
          <TextInput
            style={styles.addIngredientInput}
            placeholder="Add an ingredient…"
            placeholderTextColor={colors.textMuted}
            value={newIngredientText}
            onChangeText={setNewIngredientText}
            onSubmitEditing={handleAddIngredient}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addIngredientButton, !newIngredientText.trim() && styles.disabledButton]}
            onPress={handleAddIngredient}
            disabled={!newIngredientText.trim() || addIngredientMutation.isPending}
          >
            <Text style={styles.addIngredientButtonText}>{addIngredientMutation.isPending ? '…' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Genre tags */}
      <View style={styles.genresSection}>
        <GenreTagRow cuisines={availableCuisines} selected={selectedGenre} onSelect={handleSelectGenre} />
      </View>

      {/* Recipe count header */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Recipes for you</Text>
        <Text style={styles.listSubtitle}>{recipes.length} of {filteredStubs().length}</Text>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeCard stub={item} onPress={() => handleSelectRecipe(item)} />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleNewPhoto}>
          <Text style={styles.secondaryButtonText}>New Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, refreshDisabled && styles.disabledButton]}
          onPress={handleRefresh}
          disabled={refreshDisabled}
        >
          <Text style={styles.primaryButtonText}>{refreshLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  ingredientsSection: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  ingredientsLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
  },
  badgeRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  addIngredientRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  addIngredientInput: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  addIngredientButton: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  addIngredientButtonText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '600',
  },
  genresSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  listTitle: {
    ...typography.h3,
    color: colors.text,
  },
  listSubtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  separator: {
    height: spacing.sm,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    flex: 2,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.text,
  },
  disabledButton: {
    backgroundColor: colors.border,
  },
});
