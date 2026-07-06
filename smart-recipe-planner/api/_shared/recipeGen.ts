import { z } from 'zod';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { SupabaseClient } from '@supabase/supabase-js';
import { CUISINES } from '../../constants/genres.js';
import { RecipeStub } from '../../types/index.js';
import { TEXT_MODEL, FALLBACK_MODEL } from './models.js';
import { embedTexts, toVectorLiteral } from './embeddings.js';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

export const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  // nullable, not optional: OpenAI/xAI structured-output strict mode requires every
  // property to appear in the schema's `required` list — "optional" isn't representable,
  // so absence has to be modeled as null instead.
  unit: z.string().nullable(),
  fromScan: z.boolean(),
});

export const RecipeSchema = z.object({
  title: z.string(),
  genre: z.enum(CUISINES),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  prepTime: z.number().int().positive(),
  cookTime: z.number().int().positive(),
  servings: z.number().int().positive(),
  description: z.string(),
  matchedIngredients: z.array(z.string()),
  ingredients: z.array(IngredientSchema),
});

// Returns several ranked candidates (not just the top hit) so callers can skip past a
// duplicate/already-used image instead of being stuck with whatever ranks #1.
async function searchPixabayCandidates(query: string, count = 5): Promise<string[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return []; // not configured — fall through to Unsplash
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&category=food&safesearch=true&per_page=${count}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return []; // Pixabay returns a plain-text error string, not JSON, on failure
    const data = await res.json() as { hits?: { largeImageURL?: string; webformatURL?: string }[] };
    return (data.hits ?? [])
      .map(h => h.largeImageURL ?? h.webformatURL)
      .filter((u): u is string => !!u);
  } catch {
    return [];
  }
}

async function searchUnsplash(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    const data = await res.json() as { results?: { urls?: { regular?: string } }[] };
    return data.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

// Pixabay's free tier has a far more generous rate limit than Unsplash's Demo-tier
// 50/HOUR, so it's the primary source and can afford a per-recipe-title search again
// instead of sharing one generic photo per cuisine. Falls back to a cuisine-level Pixabay
// query if the specific title has no match, and only drops to Unsplash — cached by genre,
// same tight-budget treatment as before — if Pixabay is unavailable entirely.
const unsplashGenreCache = new Map<string, Promise<string | null>>();

function fetchUnsplashFallback(genre: string): Promise<string | null> {
  if (!unsplashGenreCache.has(genre)) {
    unsplashGenreCache.set(genre, searchUnsplash(`${genre} food`));
  }
  return unsplashGenreCache.get(genre)!;
}

function pickUnused(candidates: string[], used: Set<string>): string | null {
  return candidates.find(url => !used.has(url)) ?? candidates[0] ?? null;
}

/**
 * Resolves one image per recipe, avoiding repeats against `alreadyUsed` (images already
 * persisted for this ingredient set) and against each other within this same batch.
 * Phase 1 runs every recipe's title search in parallel — the fast path, since most
 * recipes get a distinct hit here. Phase 2 only runs (sequentially, since each pick
 * affects what the next one should avoid) for the recipes that came up empty or
 * collided with something already claimed — normally a small minority.
 */
export async function fetchRecipeImages(
  recipes: { title: string; genre: string }[],
  alreadyUsed: Iterable<string> = []
): Promise<(string | null)[]> {
  // "X dish"/"X food dish" rather than the bare title/cuisine — nudges Pixabay's broad
  // "food" category toward plated/cooked photography instead of raw-ingredient shots.
  const titleCandidates = await Promise.all(
    recipes.map(r => searchPixabayCandidates(`${r.title} dish`))
  );

  const used = new Set(alreadyUsed);
  const results: (string | null)[] = [];

  for (let i = 0; i < recipes.length; i++) {
    let picked = pickUnused(titleCandidates[i], used);

    if (!picked) {
      const genreCandidates = await searchPixabayCandidates(`${recipes[i].genre} food dish`);
      picked = pickUnused(genreCandidates, used);
    }
    if (!picked) {
      picked = await fetchUnsplashFallback(recipes[i].genre);
    }

    if (picked) used.add(picked);
    results.push(picked);
  }

  return results;
}

/**
 * Persists newly generated recipes under an existing ingredient set: inserts `recipes`
 * (with steps/tips left null — those are generated lazily on first detail view) and
 * `recipe_ingredients`, fetching an image and an embedding (title + description, used
 * later for diversity checks) per recipe along the way.
 */
export async function persistRecipes(
  supabase: SupabaseClient,
  ingredientSetId: string,
  recipes: z.infer<typeof RecipeSchema>[]
): Promise<RecipeStub[]> {
  // Avoid handing out an image that's already shown elsewhere in this ingredient set —
  // not just within this batch, since top-ups/genre fetches add more recipes to the
  // same set later and shouldn't repeat what's already been persisted for it.
  const { data: existingImageRows } = await supabase
    .from('recipes')
    .select('image_url')
    .eq('ingredient_set_id', ingredientSetId)
    .not('image_url', 'is', null);
  const alreadyUsedImages = (existingImageRows ?? [])
    .map(r => r.image_url as string | null)
    .filter((u): u is string => !!u);

  const [imageUrls, embeddings] = await Promise.all([
    fetchRecipeImages(recipes, alreadyUsedImages),
    embedTexts(recipes.map(r => `${r.title}. ${r.description}`)),
  ]);

  const { data: insertedRecipes, error: recipesErr } = await supabase
    .from('recipes')
    .insert(
      recipes.map((r, i) => ({
        ingredient_set_id: ingredientSetId,
        title: r.title,
        description: r.description,
        genre: r.genre,
        prep_time_minutes: r.prepTime,
        cook_time_minutes: r.cookTime,
        servings: r.servings,
        difficulty: r.difficulty,
        instructions: null,
        tips: null,
        image_url: imageUrls[i],
        embedding: toVectorLiteral(embeddings[i]),
      }))
    )
    .select('id');

  if (recipesErr || !insertedRecipes) throw new Error('Failed to insert recipes: ' + recipesErr?.message);

  await supabase.from('recipe_ingredients').insert(
    recipes.flatMap((r, i) =>
      r.ingredients.map(ing => ({
        recipe_id: insertedRecipes[i].id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit ?? null,
        from_scan: ing.fromScan,
      }))
    )
  );

  return recipes.map((r, i) => ({
    id: insertedRecipes[i].id,
    title: r.title,
    cuisine: r.genre,
    difficulty: r.difficulty,
    prepTime: r.prepTime,
    cookTime: r.cookTime,
    servings: r.servings,
    description: r.description,
    imageUrl: imageUrls[i] ?? undefined,
    matchedIngredients: r.matchedIngredients,
  }));
}

/** Re-projects already-generated recipes for an ingredient set into stubs — used on any cache hit. */
export async function loadCachedRecipes(supabase: SupabaseClient, ingredientSetId: string): Promise<RecipeStub[]> {
  const { data: cachedRecipes } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .eq('ingredient_set_id', ingredientSetId)
    .order('created_at');

  return (cachedRecipes ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    cuisine: r.genre,
    difficulty: r.difficulty,
    prepTime: r.prep_time_minutes,
    cookTime: r.cook_time_minutes,
    servings: r.servings,
    description: r.description,
    imageUrl: r.image_url,
    matchedIngredients: (r.recipe_ingredients as { from_scan: boolean; name: string }[])
      .filter(i => i.from_scan)
      .map(i => i.name),
  }));
}

/**
 * Generates a fresh batch of recipes from a plain ingredient list (no photo, no exclusion
 * list) — shared by the initial scan and the "add an ingredient" flow, which only differ
 * in how many recipes they ask for.
 */
export async function generateRecipesFromIngredients(ingredients: string[], count: number, minCount: number) {
  const prompt = `You are a professional chef. A user has these ingredients available: ${ingredients.join(', ')}.

Generate exactly ${count} diverse recipe outlines that primarily use these ingredients. Each recipe's genre must be one of: ${CUISINES.join(', ')}. Cover as wide a spread of those cuisines as makes sense for the ingredients.
For each recipe's ingredient list, mark items from the ingredient list as fromScan: true, and any additional pantry staples needed as fromScan: false.
matchedIngredients should list the names of fromScan: true ingredients used in that recipe.
Do NOT write step-by-step cooking instructions yet — just the recipe metadata and ingredient list. Steps are generated later, only for recipes the user actually opens.

Return structured JSON.`;

  const schema = z.object({ recipes: z.array(RecipeSchema).min(minCount) });

  try {
    return await generateObject({ model: gw(TEXT_MODEL), schema, prompt });
  } catch (primaryErr) {
    console.warn('[GENERATE] Primary model failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({ model: gw(FALLBACK_MODEL), schema, prompt });
  }
}
