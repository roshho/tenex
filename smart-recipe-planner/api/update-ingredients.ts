import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { findOrCreateIngredientSet } from './_shared/ingredientSets.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Called when the user edits the detected-ingredients list by adding one. The full
// updated list (existing + new) is resolved through the same fingerprint/fuzzy-embedding
// cache as a fresh scan, generating only 10 new recipes on a miss — this runs in the
// background while the user keeps browsing, so it shouldn't feel like a full re-scan.
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

    console.log('[UPDATE-INGREDIENTS] Resolving set for', ingredients.length, 'ingredients');
    const result = await findOrCreateIngredientSet(supabase, ingredients, 10, 8);

    console.log('[UPDATE-INGREDIENTS] Done.', result.wasCached ? 'Reused cached recipes.' : `Persisted ${result.recipes.length} recipes.`);
    return res.status(200).json({
      ingredientSetId: result.ingredientSetId,
      detectedIngredients: result.detectedIngredients,
      recipes: result.recipes,
    });
  } catch (err) {
    console.error('[UPDATE-INGREDIENTS] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to update ingredients', details: err instanceof Error ? err.message : String(err) });
  }
}
