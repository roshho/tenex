import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
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

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export default function RecipeListScreen({ navigation }: Props) {
  const {
    allStubs,
    ingredientSetId,
    detectedIngredients,
    selectedGenre,
    visibleStubs,
    advance,
    canRefresh,
    selectGenre,
    appendStubs,
    removeIngredient,
    addIngredientOptimistic,
    mergeIngredientAdditionResult,
  } = useRecipeStore();
  const recipes = visibleStubs();
  const availableCuisines = Array.from(new Set(allStubs.map(s => s.cuisine))) as Cuisine[];
  const [newIngredientText, setNewIngredientText] = useState('');
  const [isExhausted, setIsExhausted] = useState(false);
  const topUpAbortRef = useRef<AbortController | null>(null);

  // Cuisine tags are built from what's already in allStubs, so tapping one is just a local
  // filter — no network call. This is what keeps either pool stocked: the diverse "All" pool
  // when no genre is selected, or that specific cuisine when one is — always trying to hold
  // a buffer of ~10 unseen recipes in whichever pool is currently being browsed. Switching
  // tags aborts whatever was still in flight (see handleSelectGenre) so a stale response
  // can't land after the user's moved on to a different tag.
  const topUpMutation = useMutation({
    mutationFn: (genre: Cuisine | undefined) => {
      const controller = new AbortController();
      topUpAbortRef.current = controller;
      return fetchMoreRecipes(
        { ingredientSetId: ingredientSetId!, genre, excludeTitles: allStubs.map(s => s.title) },
        controller.signal
      );
    },
    onSuccess: (data) => {
      topUpAbortRef.current = null;
      appendStubs(data.recipes);
      setIsExhausted(data.exhausted);
    },
    onError: (err, genre) => {
      topUpAbortRef.current = null;
      if (isAbortError(err)) return; // deliberate cancel, not a real failure
      showError(
        'Something went wrong',
        `We couldn't find more${genre ? ` ${genre}` : ''} recipes.\n\n${err.message}`,
        () => topUpMutation.mutate(genre)
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
      if (!isExhausted && !topUpMutation.isPending) topUpMutation.mutate(selectedGenre ?? undefined);
      return;
    }
    advance();
    if (!isExhausted) {
      const state = useRecipeStore.getState();
      const remaining = state.filteredStubs().length - (state.nextIndex + 5);
      if (remaining < 10 && !topUpMutation.isPending) {
        topUpMutation.mutate(state.selectedGenre ?? undefined);
      }
    }
  };

  const handleSelectGenre = (genre: Cuisine | null) => {
    // Whatever was loading for the old tag is no longer relevant — stop waiting on it
    // (and the server stops generating it, see more-recipes.ts's abort wiring) so its
    // response can't land late and mark the wrong tag exhausted.
    topUpAbortRef.current?.abort();
    selectGenre(genre === selectedGenre ? null : genre);
    setIsExhausted(false);
  };

  const handleSelectRecipe = (stub: RecipeStub) => {
    navigation.navigate('RecipeDetail', { recipeId: stub.id, title: stub.title });
  };

  const handleAddIngredient = () => {
    const trimmed = newIngredientText.trim();
    if (!trimmed || detectedIngredients.includes(trimmed) || addIngredientMutation.isPending) return;
    setNewIngredientText('');
    const updated = [...detectedIngredients, trimmed];
    addIngredientOptimistic(trimmed); // tag appears immediately
    addIngredientMutation.mutate(updated); // recipes for it arrive in the background
  };

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

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeCard stub={item} onPress={() => handleSelectRecipe(item)} />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        onEndReached={handleRefresh}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          topUpMutation.isPending ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.footerText}>
                {selectedGenre ? `Finding more ${selectedGenre} recipes…` : 'Finding more recipes…'}
              </Text>
            </View>
          ) : isExhausted ? (
            <View style={styles.footer}>
              <Text style={styles.footerExhaustedText}>That's all for now</Text>
            </View>
          ) : null
        }
      />
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
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  separator: {
    height: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  footerText: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  footerExhaustedText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  disabledButton: {
    backgroundColor: colors.border,
  },
});
