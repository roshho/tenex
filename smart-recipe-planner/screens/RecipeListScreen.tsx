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
import { fetchMoreRecipes, updateIngredients, lookupIngredients } from '../lib/api';
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
    setStubs,
    addIngredientOptimistic,
    mergeIngredientAdditionResult,
  } = useRecipeStore();
  const recipes = visibleStubs();
  const availableCuisines = Array.from(new Set(allStubs.map(s => s.cuisine))) as Cuisine[];
  const [newIngredientText, setNewIngredientText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
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

  // Removing a tag filters allStubs down instantly (see removeIngredient in the store) —
  // no network call needed for that. This mutation is a background enhancement on top:
  // check whether the *reduced* ingredient list already has a persisted set in the
  // database (exact/fuzzy match, same cache the rest of the app uses) and, if so, swap to
  // its full cached recipe list instead of just the leftovers of the current one. It never
  // generates — a miss just means the instant client-side filter is the final result, and
  // we stop pagination from silently regenerating against the now-stale ingredient list.
  const removeIngredientLookupMutation = useMutation({
    mutationFn: (updated: string[]) => lookupIngredients(updated),
    onSuccess: (data) => {
      if (data.matched) {
        // The matched set may hold plenty of recipes the user hasn't paged through yet —
        // let normal pagination/exhaustion logic re-evaluate against the fuller pool.
        setStubs(data.recipes, data.detectedIngredients, data.ingredientSetId);
        setIsExhausted(false);
      } else {
        // No persisted set for this combination, and we deliberately don't generate one
        // here — the current (already-filtered) pool is all there is until more ingredients
        // change things again.
        setIsExhausted(true);
      }
    },
  });

  const handleRemoveIngredient = (name: string) => {
    const updated = detectedIngredients.filter(i => i !== name);
    removeIngredient(name); // instant local filter, no backend call
    if (updated.length === 0) return; // nothing left to look up
    removeIngredientLookupMutation.mutate(updated);
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
        <Text style={styles.sectionLabel}>Detected ingredients</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
          {detectedIngredients.map((ing) => (
            <IngredientBadge key={ing} label={ing} onRemove={() => handleRemoveIngredient(ing)} />
          ))}
        </ScrollView>
        <View style={styles.addIngredientRow}>
          <TextInput
            style={[styles.addIngredientInput, inputFocused && styles.addIngredientInputFocused]}
            placeholder="Add an ingredient…"
            placeholderTextColor={colors.textMuted}
            value={newIngredientText}
            onChangeText={setNewIngredientText}
            onSubmitEditing={handleAddIngredient}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addIngredientButton, !newIngredientText.trim() && styles.disabledButton]}
            onPress={handleAddIngredient}
            disabled={!newIngredientText.trim() || addIngredientMutation.isPending}
            activeOpacity={0.85}
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {selectedGenre ? `No ${selectedGenre} recipes yet.` : 'Finding recipes for you…'}
            </Text>
          </View>
        }
        ListFooterComponent={
          topUpMutation.isPending ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.footerText}>
                {selectedGenre ? `Finding more ${selectedGenre} recipes…` : 'Finding more recipes…'}
              </Text>
            </View>
          ) : isExhausted && recipes.length > 0 ? (
            <View style={styles.footer}>
              <View style={styles.footerRule} />
              <Text style={styles.footerExhaustedText}>That's all for now</Text>
              <View style={styles.footerRule} />
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
  sectionLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
    textTransform: 'uppercase',
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
  addIngredientInputFocused: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
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
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textMuted,
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
  footerRule: {
    width: 24,
    height: 1,
    backgroundColor: colors.border,
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
