import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { z } from 'zod';
import { RecipeSchema, persistRecipes } from './_shared/recipeGen.js';
import { VISION_MODEL, TEXT_MODEL, FALLBACK_MODEL } from './_shared/models.js';
import { CUISINES } from '../constants/genres.js';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fingerprint(ingredients: string[]): string {
  const normalized = ingredients.map(i => i.toLowerCase().trim()).sort();
  return createHash('md5').update(normalized.join(',')).digest('hex');
}

const IdentifySchema = z.object({
  detectedIngredients: z.array(z.string()),
});

// Vision-only call: just "what's in this photo", nothing else. Small schema, fast,
// and keeps the accuracy-sensitive part on a real vision-capable model.
async function identifyIngredientsWithFallback(imageBuffer: Buffer) {
  const prompt = `You are a professional chef. Analyze this photo of ingredients. Identify every ingredient you can clearly see. Be specific (e.g. "chicken breast" not just "chicken"). Return structured JSON.`;

  try {
    return await generateObject({
      model: gw(VISION_MODEL),
      schema: IdentifySchema,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: imageBuffer, mediaType: 'image/jpeg' },
          { type: 'text', text: prompt },
        ],
      }],
    });
  } catch (primaryErr) {
    console.warn('[ANALYZE] Vision model failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({
      model: gw(FALLBACK_MODEL),
      schema: IdentifySchema,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: imageBuffer, mediaType: 'image/jpeg' },
          { type: 'text', text: prompt },
        ],
      }],
    });
  }
}

const RecipesSchema = z.object({
  recipes: z.array(RecipeSchema).min(18),
});

// Text-only call: no image, so it can run on a cheap/fast model — creativity and
// reasoning depth barely matter for "write a plausible recipe".
async function generateRecipesWithFallback(ingredients: string[]) {
  const prompt = `You are a professional chef. A user has these ingredients available: ${ingredients.join(', ')}.

Generate exactly 20 diverse recipe outlines that primarily use these ingredients. Each recipe's genre must be one of: ${CUISINES.join(', ')}. Cover as wide a spread of those cuisines as makes sense for the ingredients.
For each recipe's ingredient list, mark items from the ingredient list as fromScan: true, and any additional pantry staples needed as fromScan: false.
matchedIngredients should list the names of fromScan: true ingredients used in that recipe.
Do NOT write step-by-step cooking instructions yet — just the recipe metadata and ingredient list. Steps are generated later, only for recipes the user actually opens.

Return structured JSON.`;

  try {
    return await generateObject({ model: gw(TEXT_MODEL), schema: RecipesSchema, prompt });
  } catch (primaryErr) {
    console.warn('[ANALYZE] Recipe generation failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({ model: gw(FALLBACK_MODEL), schema: RecipesSchema, prompt });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { image } = (req.body ?? {}) as { image?: string };
    if (!image) return res.status(400).json({ error: 'image is required' });

    const imageBuffer = Buffer.from(image, 'base64');

    // Step 1: identify ingredients (vision-capable model, small/fast schema)
    console.log('[ANALYZE] Identifying ingredients...');
    const { object: identified } = await identifyIngredientsWithFallback(imageBuffer);
    console.log('[ANALYZE] Detected', identified.detectedIngredients.length, 'ingredients');

    const fp = fingerprint(identified.detectedIngredients);

    // Step 2: check Supabase cache by fingerprint
    const { data: setData } = await supabase
      .from('ingredient_sets')
      .select('id, ingredients')
      .eq('fingerprint', fp)
      .single();

    if (setData) {
      console.log('[ANALYZE] Cache hit for fingerprint', fp);
      const { data: cachedRecipes } = await supabase
        .from('recipes')
        .select('*, recipe_ingredients(*)')
        .eq('ingredient_set_id', setData.id)
        .order('created_at');

      const stubs = (cachedRecipes ?? []).map((r) => ({
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

      return res.status(200).json({ ingredientSetId: setData.id, detectedIngredients: setData.ingredients, recipes: stubs });
    }

    // Step 3: cache miss — generate recipes (text-only, fast/cheap model), then persist
    console.log('[ANALYZE] Cache miss, generating recipes...');
    const { object: generated } = await generateRecipesWithFallback(identified.detectedIngredients);

    const { data: setRow, error: setErr } = await supabase
      .from('ingredient_sets')
      .insert({ fingerprint: fp, ingredients: identified.detectedIngredients })
      .select('id')
      .single();

    if (setErr || !setRow) throw new Error('Failed to insert ingredient set: ' + setErr?.message);

    const stubs = await persistRecipes(supabase, setRow.id, generated.recipes);

    console.log('[ANALYZE] Done. Persisted', stubs.length, 'recipes.');
    return res.status(200).json({ ingredientSetId: setRow.id, detectedIngredients: identified.detectedIngredients, recipes: stubs });
  } catch (err) {
    console.error('[ANALYZE] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to analyze image', details: err instanceof Error ? err.message : String(err) });
  }
}
