import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { z } from 'zod';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fingerprint(ingredients: string[]): string {
  const normalized = ingredients.map(i => i.toLowerCase().trim()).sort();
  return createHash('md5').update(normalized.join(',')).digest('hex');
}

async function fetchUnsplashImage(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
    );
    const data = await res.json() as { results?: { urls?: { regular?: string } }[] };
    return data.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  unit: z.string().optional(),
  fromScan: z.boolean(),
});

const RecipeSchema = z.object({
  title: z.string(),
  genre: z.string(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  prepTime: z.number().int().positive(),
  cookTime: z.number().int().positive(),
  servings: z.number().int().positive(),
  description: z.string(),
  matchedIngredients: z.array(z.string()),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()).min(3),
  tips: z.string().optional(),
});

const AnalysisSchema = z.object({
  detectedIngredients: z.array(z.string()),
  recipes: z.array(RecipeSchema).min(25),
});

async function analyzeWithFallback(imageBuffer: Buffer) {
  const primaryModel = gw('anthropic/claude-sonnet-4-6');
  const prompt = `You are a professional chef. Analyze this photo of ingredients.

1. Identify every ingredient you can clearly see. Be specific (e.g. "chicken breast" not just "chicken").
2. Generate exactly 30 diverse recipes that primarily use these ingredients. Include a wide variety of global cuisines.
   For each recipe's ingredient list, mark items from the photo as fromScan: true, and any additional pantry staples needed as fromScan: false.
   matchedIngredients should list the names of fromScan: true ingredients used in that recipe.

Return structured JSON.`;

  try {
    return await generateObject({
      model: primaryModel,
      schema: AnalysisSchema,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: imageBuffer, mediaType: 'image/jpeg' },
          { type: 'text', text: prompt },
        ],
      }],
    });
  } catch (primaryErr) {
    console.warn('[ANALYZE] Primary model failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({
      model: gw('openai/gpt-4o'),
      schema: AnalysisSchema,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { image } = req.body as { image: string };
  if (!image) return res.status(400).json({ error: 'image is required' });

  try {
    const imageBuffer = Buffer.from(image, 'base64');

    // Step 1: identify ingredients + generate 30 recipes via AI Gateway
    console.log('[ANALYZE] Calling AI Gateway...');
    const { object: analysis } = await analyzeWithFallback(imageBuffer);
    console.log('[ANALYZE] Detected', analysis.detectedIngredients.length, 'ingredients,', analysis.recipes.length, 'recipes');

    const fp = fingerprint(analysis.detectedIngredients);

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

      return res.status(200).json({ detectedIngredients: setData.ingredients, recipes: stubs });
    }

    // Step 3: cache miss — fetch images in parallel, then persist to DB
    console.log('[ANALYZE] Cache miss, fetching images and persisting...');
    const imageUrls = await Promise.all(analysis.recipes.map(r => fetchUnsplashImage(r.title)));

    const { data: setRow, error: setErr } = await supabase
      .from('ingredient_sets')
      .insert({ fingerprint: fp, ingredients: analysis.detectedIngredients })
      .select('id')
      .single();

    if (setErr || !setRow) throw new Error('Failed to insert ingredient set: ' + setErr?.message);

    const { data: insertedRecipes, error: recipesErr } = await supabase
      .from('recipes')
      .insert(
        analysis.recipes.map((r, i) => ({
          ingredient_set_id: setRow.id,
          title: r.title,
          description: r.description,
          genre: r.genre,
          prep_time_minutes: r.prepTime,
          cook_time_minutes: r.cookTime,
          servings: r.servings,
          difficulty: r.difficulty,
          instructions: r.steps,
          tips: r.tips ?? null,
          image_url: imageUrls[i],
        }))
      )
      .select('id');

    if (recipesErr || !insertedRecipes) throw new Error('Failed to insert recipes: ' + recipesErr?.message);

    await supabase.from('recipe_ingredients').insert(
      analysis.recipes.flatMap((r, i) =>
        r.ingredients.map(ing => ({
          recipe_id: insertedRecipes[i].id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit ?? null,
          from_scan: ing.fromScan,
        }))
      )
    );

    const stubs = analysis.recipes.map((r, i) => ({
      id: insertedRecipes[i].id,
      title: r.title,
      cuisine: r.genre,
      difficulty: r.difficulty,
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      servings: r.servings,
      description: r.description,
      imageUrl: imageUrls[i],
      matchedIngredients: r.matchedIngredients,
    }));

    console.log('[ANALYZE] Done. Persisted', stubs.length, 'recipes.');
    return res.status(200).json({ detectedIngredients: analysis.detectedIngredients, recipes: stubs });
  } catch (err) {
    console.error('[ANALYZE] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to analyze image', details: err instanceof Error ? err.message : String(err) });
  }
}
