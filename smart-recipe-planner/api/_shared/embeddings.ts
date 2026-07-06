import { embed, embedMany, cosineSimilarity } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

const gw = createGateway({ apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY });
const EMBEDDING_MODEL = gw.embeddingModel('openai/text-embedding-3-small');

// Heuristic starting points, not empirically tuned — adjust based on real usage.
export const INGREDIENT_FUZZY_MATCH_THRESHOLD = 0.92;
export const RECIPE_DIVERSITY_THRESHOLD = 0.9;

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: EMBEDDING_MODEL, value: text });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: EMBEDDING_MODEL, values: texts });
  return embeddings;
}

// Supabase/PostgREST returns pgvector columns as their string literal form
// (e.g. "[0.1,0.2,...]"), not a parsed array — normalize either shape.
export function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// JSON.stringify of a plain number array produces exactly pgvector's "[v1,v2,...]"
// literal syntax, so it can be used directly as the column value on insert.
export function toVectorLiteral(embedding: number[]): string {
  return JSON.stringify(embedding);
}

export { cosineSimilarity };
