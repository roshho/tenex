import { create } from 'zustand';
import { RecipeStub } from '../types';
import { Cuisine } from '../constants/genres';

interface RecipeStore {
  allStubs: RecipeStub[];
  ingredientSetId: string | null;
  detectedIngredients: string[];
  selectedGenre: Cuisine | null;
  nextIndex: number;

  setStubs: (stubs: RecipeStub[], ingredients: string[], ingredientSetId: string) => void;
  appendStubs: (stubs: RecipeStub[]) => void;
  removeIngredient: (name: string) => void;
  applyIngredientAddition: (ingredients: string[], ingredientSetId: string, newStubs: RecipeStub[]) => void;
  selectGenre: (genre: Cuisine | null) => void;
  advance: () => void;
  filteredStubs: () => RecipeStub[];
  visibleStubs: () => RecipeStub[];
  canRefresh: () => boolean;
  reset: () => void;
}

export const useRecipeStore = create<RecipeStore>((set, get) => ({
  allStubs: [],
  ingredientSetId: null,
  detectedIngredients: [],
  selectedGenre: null,
  nextIndex: 0,

  setStubs: (stubs, ingredients, ingredientSetId) =>
    set({ allStubs: stubs, ingredientSetId, detectedIngredients: ingredients, selectedGenre: null, nextIndex: 0 }),

  appendStubs: (stubs) => set(state => ({ allStubs: [...state.allStubs, ...stubs] })),

  // Removing a detected ingredient is purely cosmetic — the already-generated recipes
  // stay exactly as they are, no recompute.
  removeIngredient: (name) =>
    set(state => ({ detectedIngredients: state.detectedIngredients.filter(i => i !== name) })),

  // Adding one resolves to a (possibly new) ingredient set generated/found in the
  // background; merge its recipes in and start pointing future requests at it.
  applyIngredientAddition: (ingredients, ingredientSetId, newStubs) =>
    set(state => ({
      detectedIngredients: ingredients,
      ingredientSetId,
      allStubs: [...state.allStubs, ...newStubs],
    })),

  selectGenre: (genre) => set({ selectedGenre: genre, nextIndex: 0 }),

  filteredStubs: () => {
    const { allStubs, selectedGenre } = get();
    return selectedGenre ? allStubs.filter(s => s.cuisine === selectedGenre) : allStubs;
  },

  advance: () => {
    const { nextIndex, filteredStubs } = get();
    const next = nextIndex + 5;
    if (next < filteredStubs().length) set({ nextIndex: next });
  },

  // Everything from the start through the current page, not a sliding 5-item window —
  // so "Show 5 More" grows the list and the user can scroll back up to earlier recipes.
  visibleStubs: () => {
    const { nextIndex, filteredStubs } = get();
    return filteredStubs().slice(0, nextIndex + 5);
  },

  canRefresh: () => {
    const { nextIndex, filteredStubs } = get();
    return nextIndex + 5 < filteredStubs().length;
  },

  reset: () => set({ allStubs: [], ingredientSetId: null, detectedIngredients: [], selectedGenre: null, nextIndex: 0 }),
}));
