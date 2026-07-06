import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { RecipeStub } from '../../types/index.js';
import { loadCachedRecipes, persistRecipes, generateRecipesFromIngredients } from './recipeGen.js';
import { embedText, parseEmbedding, cosineSimilarity, toVectorLiteral, INGREDIENT_FUZZY_MATCH_THRESHOLD } from './embeddings.js';

export function fingerprint(ingredients: string[]): string {
  const normalized = ingredients.map(i => i.toLowerCase().trim()).sort();
  return createHash('md5').update(normalized.join(',')).digest('hex');
}

interface FindOrCreateResult {
  ingredientSetId: string;
  detectedIngredients: string[];
  recipes: RecipeStub[];
  wasCached: boolean;
}

interface MatchResult {
  ingredientSetId: string;
  detectedIngredients: string[];
  recipes: RecipeStub[];
}

async function matchExactFingerprint(supabase: SupabaseClient, fp: string): Promise<MatchResult | null> {
  const { data: exactMatch } = await supabase
    .from('ingredient_sets')
    .select('id, ingredients')
    .eq('fingerprint', fp)
    .single();

  if (!exactMatch) return null;

  console.log('[INGREDIENT-SET] Exact fingerprint match');
  const recipes = await loadCachedRecipes(supabase, exactMatch.id);
  return { ingredientSetId: exactMatch.id, detectedIngredients: exactMatch.ingredients, recipes };
}

async function matchFuzzyEmbedding(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  candidateFilter?: (ingredients: string[]) => boolean
): Promise<MatchResult | null> {
  const { data: existingSets } = await supabase
    .from('ingredient_sets')
    .select('id, ingredients, embedding')
    .not('embedding', 'is', null);

  let bestMatch: { id: string; ingredients: string[] } | null = null;
  let bestSimilarity = 0;
  for (const set of existingSets ?? []) {
    if (candidateFilter && !candidateFilter(set.ingredients)) continue;
    const embedding = parseEmbedding(set.embedding);
    if (!embedding) continue;
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = { id: set.id, ingredients: set.ingredients };
    }
  }

  if (!bestMatch || bestSimilarity <= INGREDIENT_FUZZY_MATCH_THRESHOLD) return null;

  console.log('[INGREDIENT-SET] Fuzzy embedding match, similarity', bestSimilarity.toFixed(3));
  const recipes = await loadCachedRecipes(supabase, bestMatch.id);
  return { ingredientSetId: bestMatch.id, detectedIngredients: bestMatch.ingredients, recipes };
}

/**
 * Read-only lookup: exact fingerprint match, then fuzzy embedding match against
 * already-persisted ingredient sets. Returns null if neither hits — never generates.
 * Used when a caller must not trigger a fresh LLM call (e.g. resolving the reduced list
 * after the user removes a detected ingredient), where the only acceptable outcomes are
 * "reuse what's already in the database" or "nothing changes."
 *
 * The fuzzy match is restricted to sets whose ingredients are a subset of the query: an
 * unrestricted match would very likely land back on the set the caller is trying to move
 * away from (dropping one ingredient out of several barely moves the embedding), silently
 * reintroducing recipes tied to an ingredient the user just removed.
 */
export async function findExistingIngredientSet(
  supabase: SupabaseClient,
  ingredients: string[]
): Promise<MatchResult | null> {
  const exact = await matchExactFingerprint(supabase, fingerprint(ingredients));
  if (exact) return exact;

  const normalizedQuery = new Set(ingredients.map(i => i.toLowerCase().trim()));
  const queryEmbedding = await embedText(ingredients.slice().sort().join(', '));
  return matchFuzzyEmbedding(supabase, queryEmbedding, (candidateIngredients) =>
    candidateIngredients.every(i => normalizedQuery.has(i.toLowerCase().trim()))
  );
}

/**
 * Given a resolved ingredient list, finds an existing ingredient set to reuse (exact
 * fingerprint match, then fuzzy embedding match) or generates and persists a new one.
 * Shared by the initial scan (after vision identification) and the "add an ingredient"
 * flow — both reduce to "I have this ingredient list, get me recipes for it."
 */
export async function findOrCreateIngredientSet(
  supabase: SupabaseClient,
  ingredients: string[],
  generateCount: number,
  generateMinCount: number,
  imageHash?: string
): Promise<FindOrCreateResult> {
  const fp = fingerprint(ingredients);
  const exact = await matchExactFingerprint(supabase, fp);
  if (exact) return { ...exact, wasCached: true };

  // Computed once here and reused below for the insert on a miss — matchFuzzyEmbedding
  // takes it as a param rather than computing it itself so this stays a single embedding
  // call per request (findExistingIngredientSet, which never needs the embedding again
  // afterward, computes its own independently).
  const queryEmbedding = await embedText(ingredients.slice().sort().join(', '));
  const fuzzy = await matchFuzzyEmbedding(supabase, queryEmbedding);
  if (fuzzy) return { ...fuzzy, wasCached: true };

  console.log('[INGREDIENT-SET] No match, generating fresh recipes');
  const { object: generated } = await generateRecipesFromIngredients(ingredients, generateCount, generateMinCount);

  const { data: setRow, error: setErr } = await supabase
    .from('ingredient_sets')
    .insert({
      fingerprint: fp,
      ingredients,
      embedding: toVectorLiteral(queryEmbedding),
      image_hash: imageHash ?? null,
    })
    .select('id')
    .single();

  if (setErr || !setRow) throw new Error('Failed to insert ingredient set: ' + setErr?.message);

  const recipes = await persistRecipes(supabase, setRow.id, generated.recipes);
  return { ingredientSetId: setRow.id, detectedIngredients: ingredients, recipes, wasCached: false };
}
