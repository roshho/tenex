import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { RecipeSchema, persistRecipes } from './_shared/recipeGen.js';
import { TEXT_MODEL, FALLBACK_MODEL } from './_shared/models.js';
import { embedTexts, parseEmbedding, cosineSimilarity, RECIPE_DIVERSITY_THRESHOLD } from './_shared/embeddings.js';
import { CUISINES, Cuisine } from '../constants/genres.js';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function buildSchema(minCount: number) {
  // A harder ask than the initial scan's open-ended generation — don't reject a good
  // partial batch just because it fell a bit short of the target.
  return z.object({ recipes: z.array(RecipeSchema).min(minCount) });
}

async function generateMoreWithFallback(prompt: string, minCount: number, abortSignal?: AbortSignal) {
  const schema = buildSchema(minCount);
  try {
    return await generateObject({ model: gw(TEXT_MODEL), schema, prompt, abortSignal });
  } catch (primaryErr) {
    if (abortSignal?.aborted) throw primaryErr; // client's gone, no point trying the fallback too
    console.warn('[MORE-RECIPES] Primary model failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({ model: gw(FALLBACK_MODEL), schema, prompt, abortSignal });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // If the client cancels (switched cuisine tags, left the screen), stop paying for the
  // LLM call rather than just letting the client stop waiting for it.
  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  try {
    const { ingredientSetId, excludeTitles, genre } = (req.body ?? {}) as {
      ingredientSetId?: string;
      excludeTitles?: string[];
      genre?: Cuisine;
    };
    if (!ingredientSetId) return res.status(400).json({ error: 'ingredientSetId is required' });
    if (genre && !(CUISINES as readonly string[]).includes(genre)) {
      return res.status(400).json({ error: 'Invalid genre' });
    }

    const { data: setRow, error: setErr } = await supabase
      .from('ingredient_sets')
      .select('id, ingredients')
      .eq('id', ingredientSetId)
      .single();

    if (setErr || !setRow) return res.status(404).json({ error: 'Ingredient set not found' });

    const ingredients = setRow.ingredients as string[];
    const exclude = excludeTitles ?? [];

    // A single cuisine is a narrower target than "any of 10 cuisines", so ask for fewer.
    const targetCount = genre ? 10 : 15;
    const minCount = genre ? 7 : 10;

    const prompt = `You are a professional chef. A user scanned these ingredients: ${ingredients.join(', ')}.

Generate ${targetCount} NEW diverse recipe outlines that primarily use these ingredients (at least ${minCount} if you truly can't find ${targetCount} good, non-repeating ones).
${genre
        ? `Every recipe's genre must be "${genre}".`
        : `Each recipe's genre must be one of: ${CUISINES.join(', ')}. Cover as wide a spread of those cuisines as makes sense for the ingredients.`}
These recipes must be entirely different from the ones already shown to the user — do not repeat or lightly rename any of these existing titles:
${exclude.length > 0 ? exclude.map(t => `- ${t}`).join('\n') : '(none yet)'}

For each recipe's ingredient list, mark items from the scan as fromScan: true, and any additional pantry staples needed as fromScan: false.
matchedIngredients should list the names of fromScan: true ingredients used in that recipe.
Do NOT write step-by-step cooking instructions yet — just the recipe metadata and ingredient list. Steps are generated later, only for recipes the user actually opens.

Return structured JSON.`;

    console.log('[MORE-RECIPES] Generating for set', ingredientSetId, genre ? `genre=${genre}` : '(diverse)');
    const { object: result } = await generateMoreWithFallback(prompt, minCount, abortController.signal);

    // Force the requested genre rather than trusting the model's compliance with the prompt —
    // the client filters recipes by exact genre match, so this must be exact.
    const candidates = genre ? result.recipes.map(r => ({ ...r, genre })) : result.recipes;

    // Diversity filter: title-based exclusion only stops exact/near-exact repeats. Embed
    // each candidate and drop any that are semantically too close to a recipe already
    // shown for this ingredient set — different name for the same dish, different cuisine
    // label on an identical preparation, etc.
    const [candidateEmbeddings, existingRows] = await Promise.all([
      embedTexts(candidates.map(r => `${r.title}. ${r.description}`)),
      supabase.from('recipes').select('embedding').eq('ingredient_set_id', ingredientSetId).not('embedding', 'is', null),
    ]);
    const existingEmbeddings = (existingRows.data ?? [])
      .map(r => parseEmbedding(r.embedding))
      .filter((e): e is number[] => e !== null);

    const diverseRecipes = candidates.filter((_, i) => {
      const candidate = candidateEmbeddings[i];
      const maxSimilarity = existingEmbeddings.reduce(
        (max, existing) => Math.max(max, cosineSimilarity(candidate, existing)),
        0
      );
      return maxSimilarity < RECIPE_DIVERSITY_THRESHOLD;
    });

    const survivalRatio = diverseRecipes.length / candidates.length;
    const exhausted = survivalRatio < 0.5;
    console.log(
      '[MORE-RECIPES] Generated', candidates.length,
      '— diverse enough to keep:', diverseRecipes.length,
      exhausted ? '(flagging exhausted)' : ''
    );

    const stubs = diverseRecipes.length > 0
      ? await persistRecipes(supabase, ingredientSetId, diverseRecipes)
      : [];

    console.log('[MORE-RECIPES] Done. Persisted', stubs.length, 'recipes.');
    return res.status(200).json({ recipes: stubs, exhausted });
  } catch (err) {
    if (abortController.signal.aborted) {
      console.log('[MORE-RECIPES] Client disconnected, generation cancelled.');
      return; // the client is already gone — nothing to send a response to
    }
    console.error('[MORE-RECIPES] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to generate more recipes', details: err instanceof Error ? err.message : String(err) });
  }
}
