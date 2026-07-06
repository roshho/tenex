// Single source of truth for which AI Gateway models the backend calls.
// Change models here — not per-file — so every call site stays in sync.

// Ingredient identification from a photo — needs real vision capability.
export const VISION_MODEL = 'xai/grok-4.3';

// Recipe metadata + step generation — text-only, and creativity/reasoning depth
// barely matters for "write a plausible recipe", so a fast/cheap model is the right trade.
export const TEXT_MODEL = 'openai/gpt-5-mini';

// Shared fallback for both call types — already proven to work for vision and text alike.
export const FALLBACK_MODEL = 'openai/gpt-5.5';
