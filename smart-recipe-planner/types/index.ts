import { Cuisine } from '../constants/genres';

export interface RecipeStub {
  id: string;
  title: string;
  cuisine: Cuisine;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  prepTime: number;
  cookTime: number;
  servings: number;
  matchedIngredients: string[];
  description: string;
  imageUrl?: string;
}

export interface RecipeFull extends RecipeStub {
  ingredients: Ingredient[];
  steps: string[];
  tips?: string;
}

export interface Ingredient {
  name: string;
  quantity: string;
  unit?: string;
}

export interface AnalyzeResponse {
  ingredientSetId: string;
  detectedIngredients: string[];
  recipes: RecipeStub[];
}

export type RootStackParamList = {
  Camera: undefined;
  RecipeList: {
    ingredients: string[];
  };
  RecipeDetail: {
    recipeId: string;
    title: string;
  };
};
