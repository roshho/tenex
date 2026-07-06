import { AnalyzeResponse, RecipeFull, MoreRecipesResponse, UpdateIngredientsResponse, LookupIngredientsResponse } from '../types';
import { Cuisine } from '../constants/genres';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function analyzeIngredients(base64Image: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!res.ok) {
    let message = 'Failed to analyze image';
    try {
      const body = await res.json();
      if (body?.error) message = body.details ? `${body.error}: ${body.details}` : body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message);
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

export async function fetchMoreRecipes(
  params: {
    ingredientSetId: string;
    excludeTitles: string[];
    genre?: Cuisine;
  },
  signal?: AbortSignal
): Promise<MoreRecipesResponse> {
  const res = await fetch(`${BASE_URL}/api/more-recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    let message = 'Failed to fetch more recipes';
    try {
      const body = await res.json();
      if (body?.error) message = body.details ? `${body.error}: ${body.details}` : body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }

  return res.json();
}

export async function updateIngredients(ingredients: string[]): Promise<UpdateIngredientsResponse> {
  const res = await fetch(`${BASE_URL}/api/update-ingredients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients }),
  });

  if (!res.ok) {
    let message = 'Failed to update ingredients';
    try {
      const body = await res.json();
      if (body?.error) message = body.details ? `${body.error}: ${body.details}` : body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }

  return res.json();
}

// Read-only counterpart to updateIngredients — used when an ingredient is removed.
// Never triggers generation server-side, so this either returns already-persisted
// recipes for the reduced list or { matched: false }; it never throws on "no match."
export async function lookupIngredients(ingredients: string[]): Promise<LookupIngredientsResponse> {
  const res = await fetch(`${BASE_URL}/api/lookup-ingredients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients }),
  });

  if (!res.ok) {
    let message = 'Failed to look up ingredients';
    try {
      const body = await res.json();
      if (body?.error) message = body.details ? `${body.error}: ${body.details}` : body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }

  return res.json();
}
