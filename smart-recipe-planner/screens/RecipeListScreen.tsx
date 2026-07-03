import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, RecipeStub } from '../types';
import { useRecipeStore } from '../store/recipeStore';
import RecipeCard from '../components/RecipeCard';
import IngredientBadge from '../components/IngredientBadge';
import { colors, spacing, radius, typography } from '../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RecipeList'>;
  route: RouteProp<RootStackParamList, 'RecipeList'>;
};

export default function RecipeListScreen({ navigation, route }: Props) {
  const { ingredients } = route.params;
  const { currentBatch, advance, canRefresh, reset } = useRecipeStore();
  const recipes = currentBatch();

  const handleRefresh = () => advance();

  const handleSelectRecipe = (stub: RecipeStub) => {
    navigation.navigate('RecipeDetail', { recipeId: stub.id, title: stub.title });
  };

  const handleNewPhoto = () => {
    reset();
    navigation.popToTop();
  };

  return (
    <View style={styles.container}>
      {/* Detected ingredients strip */}
      <View style={styles.ingredientsSection}>
        <Text style={styles.ingredientsLabel}>Detected ingredients</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
          {ingredients.map((ing) => (
            <IngredientBadge key={ing} label={ing} />
          ))}
        </ScrollView>
      </View>

      {/* Recipe count header */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Recipes for you</Text>
        <Text style={styles.listSubtitle}>{recipes.length} of many</Text>
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
          style={[styles.primaryButton, !canRefresh() && styles.disabledButton]}
          onPress={handleRefresh}
          disabled={!canRefresh()}
        >
          <Text style={styles.primaryButtonText}>
            {canRefresh() ? 'Show 5 More' : 'No more recipes'}
          </Text>
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
  },
  ingredientsLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
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
