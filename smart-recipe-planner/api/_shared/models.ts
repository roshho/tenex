// Single source of truth for which AI Gateway models the backend calls.
// Change models here — not per-file — so every call site stays in sync.

// Ingredient identification from a photo — needs real vision capability. Fast/non-reasoning
// tier: this is a narrow structured-extraction task (ingredient list + one boolean), not one
// that benefits from extended chain-of-thought, so the lower-latency variant is the right trade.
export const VISION_MODEL = 'xai/grok-4.1-fast-non-reasoning';

// Recipe metadata + step generation — text-only, and creativity/reasoning depth
// barely matters for "write a plausible recipe", so a fast/cheap model is the right trade.
// Nano tier, same family as the fallback below — lower risk of a new cross-provider
// schema-compliance surprise than jumping to a different provider's small model.
export const TEXT_MODEL = 'openai/gpt-5.4-nano';

// Shared fallback for both call types — already proven to work for vision and text alike.
export const FALLBACK_MODEL = 'google/gemma-4-31b-it';
