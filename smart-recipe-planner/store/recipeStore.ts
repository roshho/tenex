import { create } from 'zustand';
import { RecipeStub } from '../types';

interface RecipeStore {
  allStubs: RecipeStub[];
  nextIndex: number;
  detectedIngredients: string[];

  setStubs: (stubs: RecipeStub[], ingredients: string[]) => void;
  advance: () => void;
  currentBatch: () => RecipeStub[];
  canRefresh: () => boolean;
  reset: () => void;
}

export const useRecipeStore = create<RecipeStore>((set, get) => ({
  allStubs: [],
  nextIndex: 0,
  detectedIngredients: [],

  setStubs: (stubs, ingredients) => set({ allStubs: stubs, nextIndex: 0, detectedIngredients: ingredients }),

  advance: () => {
    const { nextIndex, allStubs } = get();
    const next = nextIndex + 5;
    if (next < allStubs.length) set({ nextIndex: next });
  },

  currentBatch: () => {
    const { allStubs, nextIndex } = get();
    return allStubs.slice(nextIndex, nextIndex + 5);
  },

  canRefresh: () => {
    const { allStubs, nextIndex } = get();
    return nextIndex + 5 < allStubs.length;
  },

  reset: () => set({ allStubs: [], nextIndex: 0, detectedIngredients: [] }),
}));
