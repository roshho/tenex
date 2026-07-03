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

The API (`api/analyze.ts`, `api/recipe.ts`) is written as Vercel serverless functions. To exercise them locally:

```bash
npx vercel dev      # in one terminal — serves api/*.ts on http://localhost:3000
npx expo start        # in another terminal — EXPO_PUBLIC_API_URL defaults to http://localhost:3000
```

`vercel dev` is the only supported way to run the API locally. Earlier `dev-server.ts`/`dev-server.js` shims (a hand-rolled HTTP router, and a legacy prototype that called AWS Bedrock directly) were removed — the router didn't parse query strings and hardcoded the wrong HTTP method for `/api/recipe`, so it silently 404'd on recipe-detail fetches. Don't reintroduce a custom router; if `vercel dev` doesn't fit a future use case, fix that instead.

### Deployment

Deployed via Vercel (`vercel.json`: `buildCommand: npm run build`). Project is linked (see `.vercel/project.json`); use `npx vercel` / `npx vercel --prod` to deploy. Env vars are managed in the Vercel dashboard and pulled locally via `vercel env pull .env`.

## Architecture

**Stack:** Expo/React Native (SDK 56, RN 0.85) + React Navigation (native-stack) + TanStack Query + Zustand, talking to Vercel serverless functions backed by Supabase (Postgres) and the Vercel AI Gateway.

`package.json` has `"type": "module"` because `ai` and `@ai-sdk/gateway` are ESM-only — removing it breaks Vercel's bundling with `ERR_REQUIRE_ESM`.

### Screen flow (`App.tsx` stack: Camera → RecipeList → RecipeDetail)

1. **`screens/CameraScreen.tsx`** — capture/pick a photo, downscale + JPEG-compress it client-side (`expo-image-manipulator`), base64-encode, `POST /api/analyze`.
2. **`screens/RecipeListScreen.tsx`** — renders 5 recipes at a time from the Zustand store; "Show 5 More" pages through an already-fetched batch (no extra network/LLM calls).
3. **`screens/RecipeDetailScreen.tsx`** — `GET /api/recipe?id=` for the full recipe (ingredients + steps), fetched lazily on navigation.

### `POST /api/analyze` (`api/analyze.ts`)

1. Calls the Vercel AI Gateway (`@ai-sdk/gateway`) with `generateObject` + a Zod schema, asking the model to both identify ingredients in the photo **and** generate 30 structured recipes in one shot. Primary model `anthropic/claude-sonnet-4-6`, falls back to `openai/gpt-4o` on failure (see `analyzeWithFallback`).
2. Hashes the sorted, normalized ingredient list (MD5) into a `fingerprint` and checks Supabase for an existing `ingredient_sets` row with that fingerprint.
   - **Cache hit:** returns the previously persisted recipe stubs directly from Supabase — no LLM call cost paid twice for the same ingredients.
   - **Cache miss:** fetches an Unsplash image per recipe in parallel, then persists `ingredient_sets` → `recipes` → `recipe_ingredients` before responding.
3. Returns `{ detectedIngredients, recipes: RecipeStub[] }` — 30 stubs, not full recipes (steps/ingredients are only fetched on demand via `/api/recipe`).

### `GET /api/recipe?id=` (`api/recipe.ts`)

Straight read-through from Supabase (`recipes` joined with `recipe_ingredients`) — no LLM involved here, since ingredients/steps were generated and stored during `/api/analyze`.

### Pagination / "no repeats on refresh"

The "5 at a time, never repeats" requirement is implemented **client-side**, not by re-querying the model: `store/recipeStore.ts` holds all 30 stubs from the single `/api/analyze` call and a `nextIndex` that advances by 5; `canRefresh()` just checks there's another full batch left in the array. This is why `AnalysisSchema` in `api/analyze.ts` requires `recipes.min(25)` (≈30 requested) up front.

### Inferred Supabase schema

No migration files are checked in; the schema only exists implicitly in the query/insert shapes in `api/analyze.ts` / `api/recipe.ts`:

- `ingredient_sets(id, fingerprint, ingredients jsonb)`
- `recipes(id, ingredient_set_id, title, description, genre, prep_time_minutes, cook_time_minutes, servings, difficulty, instructions jsonb, tips, image_url, created_at)`
- `recipe_ingredients(id, recipe_id, name, quantity, unit, from_scan bool)` — `from_scan` marks ingredients that came from the photo vs. added pantry staples.

Both API handlers use the Supabase **service role** key server-side; there's no client-side Supabase access and RLS is not relevant to app behavior.

### Types

`types/index.ts` is the single source of truth for the `RecipeStub` / `RecipeFull` / `AnalyzeResponse` / `RootStackParamList` shapes shared between screens, `lib/api.ts`, and (informally) the API handlers' response bodies — keep these in sync manually when changing either side, since there's no shared/generated client.

## Notes

- `smart-recipe-planner/AGENTS.md` (linked from `smart-recipe-planner/CLAUDE.md` via `@AGENTS.md`) flags that Expo has changed significantly — consult the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` before writing Expo-specific code rather than relying on training-data knowledge.
- `EXPO_PUBLIC_API_URL` controls which backend the Expo app talks to; unset it (or point it at `http://localhost:3000`) for local `vercel dev`, or set it to the deployed Vercel URL for production/preview builds.
