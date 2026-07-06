import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { TEXT_MODEL, FALLBACK_MODEL } from './_shared/models.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });

const RecipeDetailSchema = z.object({
  steps: z.array(z.string()).min(3),
  // nullable, not optional — see the comment on IngredientSchema.unit in _shared/recipeGen.ts.
  tips: z.string().nullable(),
});

async function generateStepsWithFallback(context: {
  title: string;
  description: string;
  genre: string;
  ingredients: { name: string; quantity: string; unit: string | null }[];
}) {
  const prompt = `You are a professional chef. Write step-by-step cooking instructions for this recipe.

Title: ${context.title}
Cuisine: ${context.genre}
Description: ${context.description}
Ingredients: ${context.ingredients.map(i => `${i.quantity}${i.unit ? ' ' + i.unit : ''} ${i.name}`).join(', ')}

Write clear, numbered steps (at least 3) a home cook can follow, plus an optional chef's tip.
Return structured JSON.`;

  try {
    return await generateObject({
      model: gw(TEXT_MODEL),
      schema: RecipeDetailSchema,
      prompt,
    });
  } catch (primaryErr) {
    console.warn('[RECIPE] Primary model failed, trying fallback:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    return await generateObject({
      model: gw(FALLBACK_MODEL),
      schema: RecipeDetailSchema,
      prompt,
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const { id } = req.query as { id: string };
  if (!id) return res.status(400).json({ error: 'id is required' });

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .eq('id', id)
    .single();

  if (error || !recipe) {
    console.error('[RECIPE] Not found:', id, error?.message);
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const ingredients = recipe.recipe_ingredients as {
    name: string;
    quantity: string;
    unit: string | null;
    from_scan: boolean;
  }[];

  let steps = recipe.instructions as string[] | null;
  let tips = recipe.tips as string | null;

  if (!steps) {
    try {
      console.log('[RECIPE] No cached instructions, generating for', id);
      const { object: detail } = await generateStepsWithFallback({
        title: recipe.title,
        description: recipe.description,
        genre: recipe.genre,
        ingredients,
      });
      steps = detail.steps;
      tips = detail.tips ?? null;

      await supabase
        .from('recipes')
        .update({ instructions: steps, tips })
        .eq('id', id);
    } catch (genErr) {
      console.error('[RECIPE] Failed to generate instructions:', genErr instanceof Error ? genErr.message : genErr);
      return res.status(500).json({ error: 'Failed to generate recipe instructions' });
    }
  }

  return res.status(200).json({
    id: recipe.id,
    title: recipe.title,
    cuisine: recipe.genre,
    difficulty: recipe.difficulty,
    prepTime: recipe.prep_time_minutes,
    cookTime: recipe.cook_time_minutes,
    servings: recipe.servings,
    description: recipe.description,
    imageUrl: recipe.image_url,
    tips,
    matchedIngredients: ingredients.filter(i => i.from_scan).map(i => i.name),
    ingredients: ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit ?? undefined,
    })),
    steps,
  });
}
