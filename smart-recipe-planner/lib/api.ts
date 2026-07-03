import { AnalyzeResponse, RecipeFull } from '../types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function analyzeIngredients(base64Image: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || 'Failed to analyze image');
  }

  return res.json();
}

export async function fetchFullRecipe(recipeId: string): Promise<RecipeFull> {
  const res = await fetch(`${BASE_URL}/api/recipe?id=${encodeURIComponent(recipeId)}`);

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || 'Failed to fetch recipe');
  }

  return res.json();
}
