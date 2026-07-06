# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo overview

This directory (`tenex`) is a single company's deliverable folder inside a larger `job-assessment-deliverables` monorepo (the git root is one level up, at `../`). It contains:

- `Engineering Take-Home Assignment.pdf` — the assignment brief.
- `README.md` — the assignment requirements and submission instructions (not app usage docs).
- `smart-recipe-planner/` — **the actual project**, an Expo mobile app + Vercel serverless backend. Almost all engineering work happens here.

There is no top-level package to build/run — always `cd smart-recipe-planner` first.

## Assignment requirements (from README.md)

Build a mobile app (Expo) where a user photographs ingredients and gets 5 recipes they can make. Refreshing gets 5 new recipes, non-repeating, drawn from the same scan. Selecting a recipe opens a full detail screen. Must be a structured UI, not a chat interface.

## Commands

All run from `smart-recipe-planner/`:

```bash
npm run start          # expo start — Metro bundler + QR code for device/simulator
npm run web             # expo start --web — fastest way to iterate in a browser
npm run android          # expo start --android
npm run ios              # expo start --ios
npm run build             # tsc --noEmit — the only "build"/typecheck step, no bundler build script
```

There is no lint or test script/config in this project.

### Running the backend locally

The API (`api/analyze.ts`, `api/more-recipes.ts`, `api/recipe.ts`, `api/update-ingredients.ts`) is written as Vercel serverless functions. To exercise them locally:

```bash
npx vercel dev      # in one terminal — serves api/*.ts on http://localhost:3000
npx expo start        # in another terminal — EXPO_PUBLIC_API_URL defaults to http://localhost:3000
```

`vercel dev` is the only supported way to run the API locally. Earlier `dev-server.ts`/`dev-server.js` shims (a hand-rolled HTTP router, and a legacy prototype that called AWS Bedrock directly) were removed — the router didn't parse query strings and hardcoded the wrong HTTP method for `/api/recipe`, so it silently 404'd on recipe-detail fetches. Don't reintroduce a custom router; if `vercel dev` doesn't fit a future use case, fix that instead.

### Deployment

Deployed via Vercel (`vercel.json`: `buildCommand: npm run build`). Project is linked (see `.vercel/project.json`); use `npx vercel` / `npx vercel --prod` to deploy. Env vars are managed in the Vercel dashboard and pulled locally via `vercel env pull .env`.

## Architecture

**Stack:** Expo/React Native (SDK 54, RN 0.81) + React Navigation (native-stack) + TanStack Query + Zustand, talking to Vercel serverless functions backed by Supabase (Postgres + pgvector) and the Vercel AI Gateway.

`package.json` has `"type": "module"` because `ai` and `@ai-sdk/gateway` are ESM-only — removing it breaks Vercel's bundling with `ERR_REQUIRE_ESM`.

### Models (`api/_shared/models.ts`)

Single source of truth for every model the backend calls — change models here, not per-file:
- `VISION_MODEL` (`xai/grok-4.3`) — ingredient identification from the photo only.
- `TEXT_MODEL` (`openai/gpt-5-nano`) — recipe metadata/step generation; cheap/fast since creativity depth barely matters here.
- `FALLBACK_MODEL` (`openai/gpt-5.5`) — shared fallback for both vision and text calls if the primary fails.

### Screen flow (`App.tsx` stack: Camera → RecipeList → RecipeDetail)

1. **`screens/CameraScreen.tsx`** — capture/pick a photo, downscale + JPEG-compress it client-side (`expo-image-manipulator`), base64-encode, `POST /api/analyze`. If the response flags `imageTooDark`, prompts the user to retake with flash or continue anyway.
2. **`screens/RecipeListScreen.tsx`** — shows the detected-ingredient badges (removable, plus a text input to add more), a row of cuisine-genre filter tags built from whatever's already loaded, and an infinite-scrolling `FlatList` of recipe stubs from the Zustand store.
3. **`screens/RecipeDetailScreen.tsx`** — `GET /api/recipe?id=` for the full recipe (ingredients + steps), fetched lazily on navigation.

### `POST /api/analyze` (`api/analyze.ts`)

1. MD5-hashes the raw base64 image; an exact `image_hash` match on `ingredient_sets` skips the vision call entirely and returns cached recipes.
2. Otherwise calls the vision model (`identifyIngredientsWithFallback`) with a small schema (`detectedIngredients`, `imageTooDark`) — a separate, cheaper call than recipe generation.
3. Hands the detected ingredients to `findOrCreateIngredientSet` (`api/_shared/ingredientSets.ts`), which resolves an `ingredient_sets` row via, in order: exact fingerprint match → fuzzy embedding match (cosine similarity > `INGREDIENT_FUZZY_MATCH_THRESHOLD`, 0.92) → fresh generation (20 recipes, min 18) via `generateRecipesFromIngredients`.
4. Returns `{ ingredientSetId, detectedIngredients, recipes, imageTooDark }` — recipe stubs only (metadata + ingredient list), no steps yet.

### `POST /api/more-recipes` (`api/more-recipes.ts`)

Tops up an already-resolved ingredient set: generates 15 more recipes (10 if a `genre` filter is set), excluding titles already shown, then embeds each candidate (title + description) and drops any whose cosine similarity to an already-persisted recipe for that set exceeds `RECIPE_DIVERSITY_THRESHOLD` (0.9) — catches same-dish-different-name repeats that title exclusion alone wouldn't. Flags `exhausted: true` if fewer than half the candidates survived that filter. Wired to abort (`req.on('close')`) if the client disconnects, since `RecipeListScreen` cancels in-flight top-ups when the user switches cuisine tags.

### `POST /api/update-ingredients` (`api/update-ingredients.ts`)

Called when the user adds an ingredient from `RecipeListScreen`. The UI adds the tag optimistically; this endpoint resolves the full updated ingredient list through the same `findOrCreateIngredientSet` cache path (10 new recipes, min 8) in the background and the results get merged in once ready.

### `GET /api/recipe?id=` (`api/recipe.ts`)

Reads `recipes` joined with `recipe_ingredients`. Steps/tips are `null` until the first request for that recipe, at which point they're generated (`generateStepsWithFallback`, `TEXT_MODEL`) and persisted back — later requests are a straight read. `cleanSteps` strips any leading numbering the model adds despite being told not to (applied at read time so it also fixes recipes persisted before this prompt existed, no migration needed).

### Recipe images (`api/_shared/recipeGen.ts` → `fetchRecipeImages`)

Pixabay is primary (per-recipe-title search, generous free-tier rate limit), falling back to a Pixabay cuisine-level query, then to Unsplash (cached per-genre, since Unsplash's demo tier is 50/hour). Tracks already-used image URLs per ingredient set so recipes don't share an image within the same set.

### Pagination / "no repeats on refresh"

Hybrid client/server: `store/recipeStore.ts` holds every stub fetched so far for the current ingredient set (`allStubs`) plus a `nextIndex` that advances by 5 (`visibleStubs()`/`advance()`). `RecipeListScreen`'s `onEndReached` calls `advance()` and, once the buffer of unseen stubs (for the current cuisine filter, or "All") drops below 10, fires `/api/more-recipes` in the background to top it back up — so scrolling rarely blocks on a live LLM call. Switching cuisine tags aborts any in-flight top-up (stale results for the old tag can't land after the fact) and resets to a fresh 5-item page for the new filter.

### Embeddings (`api/_shared/embeddings.ts`)

Wraps the AI Gateway's `openai/text-embedding-3-small` model. Similarity is computed in JS (`cosineSimilarity` from the `ai` package) against embeddings pulled from Supabase, not via a pgvector index — fine at this data volume. `INGREDIENT_FUZZY_MATCH_THRESHOLD` (0.92) and `RECIPE_DIVERSITY_THRESHOLD` (0.9) are both untuned heuristic starting points. Note the pgvector-column quirk: PostgREST returns `embedding` as a string literal (`"[0.1,0.2,...]"`), so reads go through `parseEmbedding` and writes through `toVectorLiteral`.

### Inferred Supabase schema

No migration files are checked in; the schema only exists implicitly in the query/insert shapes in `api/*.ts` and `api/_shared/*.ts`:

- `ingredient_sets(id, fingerprint, image_hash, ingredients jsonb, embedding vector)`
- `recipes(id, ingredient_set_id, title, description, genre, prep_time_minutes, cook_time_minutes, servings, difficulty, instructions jsonb, tips, image_url, embedding vector, created_at)`
- `recipe_ingredients(id, recipe_id, name, quantity, unit, from_scan bool)` — `from_scan` marks ingredients that came from the photo vs. added pantry staples.

All API handlers use the Supabase **service role** key server-side; there's no client-side Supabase access and RLS is not relevant to app behavior.

### Types

`types/index.ts` is the single source of truth for the `RecipeStub` / `RecipeFull` / `AnalyzeResponse` / `MoreRecipesResponse` / `UpdateIngredientsResponse` / `RootStackParamList` shapes shared between screens, `lib/api.ts`, and (informally) the API handlers' response bodies — keep these in sync manually when changing either side, since there's no shared/generated client. `constants/genres.ts` (`CUISINES`) is the single source of truth for valid cuisine/genre values, enforced both in the recipe Zod schema and as a request-body check in `more-recipes.ts`.

## Notes

- `smart-recipe-planner/AGENTS.md` (linked from `smart-recipe-planner/CLAUDE.md` via `@AGENTS.md`) flags that Expo has changed significantly — consult the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` before writing Expo-specific code rather than relying on training-data knowledge.
- `EXPO_PUBLIC_API_URL` controls which backend the Expo app talks to; unset it (or point it at `http://localhost:3000`) for local `vercel dev`, or set it to the deployed Vercel URL for production/preview builds.
