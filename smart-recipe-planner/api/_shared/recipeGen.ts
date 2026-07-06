import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { CUISINES } from '../../constants/genres.js';
import { RecipeStub } from '../../types/index.js';

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

export async function fetchUnsplashImage(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        // Without a bound, one stalled Unsplash request hangs the whole Promise.all
        // in persistRecipes forever, so the client sees a bare "failed to fetch" with
        // no server response at all rather than a clean error.
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await res.json() as { results?: { urls?: { regular?: string } }[] };
    return data.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

/**
 * Persists newly generated recipes under an existing ingredient set: inserts `recipes`
 * (with steps/tips left null — those are generated lazily on first detail view) and
 * `recipe_ingredients`, fetching an Unsplash image per recipe along the way.
 */
export async function persistRecipes(
  supabase: SupabaseClient,
  ingredientSetId: string,
  recipes: z.infer<typeof RecipeSchema>[]
): Promise<RecipeStub[]> {
  const imageUrls = await Promise.all(recipes.map(r => fetchUnsplashImage(r.title)));

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
