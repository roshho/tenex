import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    tips: recipe.tips,
    matchedIngredients: ingredients.filter(i => i.from_scan).map(i => i.name),
    ingredients: ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit ?? undefined,
    })),
    steps: recipe.instructions as string[],
  });
}
