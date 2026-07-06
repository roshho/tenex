import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { RecipeSchema, persistRecipes } from './_shared/recipeGen.js';
import { TEXT_MODEL, FALLBACK_MODEL } from './_shared/models.js';
import { CUISINES } from '../constants/genres.js';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 15 entirely new, non-repeating recipes is a harder ask than the initial scan's
// open-ended generation — don't reject a good partial batch.
const MoreRecipesSchema = z.object({ recipes: z.array(RecipeSchema).min(10) });

async function generateMoreWithFallback(prompt: string) {
  try {
    return await generateObject({
      model: gw(TEXT_MODEL),
      schema: MoreRecipesSchema,
      prompt,
    });
  } catch (primaryErr) {
    console.warn('[MORE-RECIPES] Primary model failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({
      model: gw(FALLBACK_MODEL),
      schema: MoreRecipesSchema,
      prompt,
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { ingredientSetId, excludeTitles } = (req.body ?? {}) as {
      ingredientSetId?: string;
      excludeTitles?: string[];
    };
    if (!ingredientSetId) return res.status(400).json({ error: 'ingredientSetId is required' });

    const { data: setRow, error: setErr } = await supabase
      .from('ingredient_sets')
      .select('id, ingredients')
      .eq('id', ingredientSetId)
      .single();

    if (setErr || !setRow) return res.status(404).json({ error: 'Ingredient set not found' });

    const ingredients = setRow.ingredients as string[];
    const exclude = excludeTitles ?? [];

    const prompt = `You are a professional chef. A user scanned these ingredients: ${ingredients.join(', ')}.

Generate 15 NEW diverse recipe outlines that primarily use these ingredients (at least 10 if you truly can't find 15 good, non-repeating ones).
Each recipe's genre must be one of: ${CUISINES.join(', ')}. Cover as wide a spread of those cuisines as makes sense for the ingredients.
These recipes must be entirely different from the ones already shown to the user — do not repeat or lightly rename any of these existing titles:
${exclude.length > 0 ? exclude.map(t => `- ${t}`).join('\n') : '(none yet)'}

For each recipe's ingredient list, mark items from the scan as fromScan: true, and any additional pantry staples needed as fromScan: false.
matchedIngredients should list the names of fromScan: true ingredients used in that recipe.
Do NOT write step-by-step cooking instructions yet — just the recipe metadata and ingredient list. Steps are generated later, only for recipes the user actually opens.

Return structured JSON.`;

    console.log('[MORE-RECIPES] Generating for set', ingredientSetId);
    const { object: result } = await generateMoreWithFallback(prompt);

    const stubs = await persistRecipes(supabase, ingredientSetId, result.recipes);

    console.log('[MORE-RECIPES] Done. Persisted', stubs.length, 'recipes.');
    return res.status(200).json({ recipes: stubs });
  } catch (err) {
    console.error('[MORE-RECIPES] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to generate more recipes', details: err instanceof Error ? err.message : String(err) });
  }
}
