import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { z } from 'zod';
import { VISION_MODEL, FALLBACK_MODEL } from './_shared/models.js';
import { findOrCreateIngredientSet } from './_shared/ingredientSets.js';
import { loadCachedRecipes } from './_shared/recipeGen.js';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const IdentifySchema = z.object({
  detectedIngredients: z.array(z.string()),
  imageTooDark: z.boolean(),
});

// Vision-only call: identify ingredients and flag dim lighting. Small schema, fast,
// and keeps the accuracy-sensitive part on a real vision-capable model.
async function identifyIngredientsWithFallback(imageBuffer: Buffer) {
  const prompt = `You are a professional chef. Analyze this photo of ingredients.

Identify every ingredient you can clearly see. Be specific (e.g. "chicken breast" not just "chicken").
Also set imageTooDark to true if the photo is dim or dark enough that you can't confidently identify ingredients, false otherwise.

Return structured JSON.`;

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

function hashImage(base64Image: string): string {
  return createHash('md5').update(base64Image).digest('hex');
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
    const imageHash = hashImage(image);

    // Step 1: exact-photo cache — skip the vision call entirely for a re-submitted image.
    const { data: hashMatch } = await supabase
      .from('ingredient_sets')
      .select('id, ingredients')
      .eq('image_hash', imageHash)
      .single();

    if (hashMatch) {
      console.log('[ANALYZE] Image-hash cache hit, skipping vision call');
      const recipes = await loadCachedRecipes(supabase, hashMatch.id);
      return res.status(200).json({
        ingredientSetId: hashMatch.id,
        detectedIngredients: hashMatch.ingredients,
        recipes,
        imageTooDark: false,
      });
    }

    // Step 2: identify ingredients (vision-capable model, small/fast schema)
    console.log('[ANALYZE] Identifying ingredients...');
    const { object: identified } = await identifyIngredientsWithFallback(imageBuffer);
    console.log('[ANALYZE] Detected', identified.detectedIngredients.length, 'ingredients, tooDark =', identified.imageTooDark);

    // Step 3: find-or-create the ingredient set (exact fingerprint match, fuzzy
    // embedding match against past scans, or generate 20 fresh recipes).
    const result = await findOrCreateIngredientSet(supabase, identified.detectedIngredients, 20, 18, imageHash);

    console.log('[ANALYZE] Done.', result.wasCached ? 'Reused cached recipes.' : `Persisted ${result.recipes.length} recipes.`);
    return res.status(200).json({
      ingredientSetId: result.ingredientSetId,
      detectedIngredients: result.detectedIngredients,
      recipes: result.recipes,
      imageTooDark: identified.imageTooDark,
    });
  } catch (err) {
    console.error('[ANALYZE] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to analyze image', details: err instanceof Error ? err.message : String(err) });
  }
}
