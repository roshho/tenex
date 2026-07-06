import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { findExistingIngredientSet } from './_shared/ingredientSets.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Read-only counterpart to update-ingredients.ts — called when the user REMOVES a
// detected ingredient. The reduced list is resolved via the same fingerprint/fuzzy-
// embedding cache, but with no generation fallback: this only ever returns recipes
// that are already persisted, so removing a tag can never trigger a fresh LLM call.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { ingredients } = (req.body ?? {}) as { ingredients?: string[] };
    if (!ingredients || ingredients.length === 0) {
      return res.status(400).json({ error: 'ingredients is required' });
    }

    console.log('[LOOKUP-INGREDIENTS] Looking up existing set for', ingredients.length, 'ingredients');
    const existing = await findExistingIngredientSet(supabase, ingredients);

    if (!existing) {
      console.log('[LOOKUP-INGREDIENTS] No existing set found.');
      return res.status(200).json({ matched: false });
    }

    console.log('[LOOKUP-INGREDIENTS] Found', existing.recipes.length, 'cached recipes.');
    return res.status(200).json({
      matched: true,
      ingredientSetId: existing.ingredientSetId,
      detectedIngredients: existing.detectedIngredients,
      recipes: existing.recipes,
    });
  } catch (err) {
    console.error('[LOOKUP-INGREDIENTS] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to look up ingredients', details: err instanceof Error ? err.message : String(err) });
  }
}
