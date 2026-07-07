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

The API (`api/analyze.ts`, `api/more-recipes.ts`, `api/recipe.ts`, `api/update-ingredients.ts`, `api/lookup-ingredients.ts`) is written as Vercel serverless functions. To exercise them locally:

```bash
npx vercel dev      # in one terminal — serves api/*.ts on http://localhost:3000
npx expo start        # in another terminal — EXPO_PUBLIC_API_URL defaults to http://localhost:3000
```

`vercel dev` is the only supported way to run the API locally. Earlier `dev-server.ts`/`dev-server.js` shims (a hand-rolled HTTP router, and a legacy prototype that called AWS Bedrock directly) were removed — the router didn't parse query strings and hardcoded the wrong HTTP method for `/api/recipe`, so it silently 404'd on recipe-detail fetches. Don't reintroduce a custom router; if `vercel dev` doesn't fit a future use case, fix that instead.

### Deployment

One Vercel project (`smart-recipe-planner`) serves both the API and the web build of the Expo app — `vercel.json`'s `buildCommand` is `npm run build && npx expo export --platform web` (typecheck, then a static web export to `dist/`, which is `outputDirectory`); a `rewrites` rule sends every non-`/api` path to `dist/index.html` for client-side routing. Project is linked (see `.vercel/project.json`); use `npx vercel` / `npx vercel --prod` to deploy. Env vars are managed in the Vercel dashboard and pulled locally via `vercel env pull .env`.

**A "Ready" deployment can still be completely broken.** If a `vercel --prod` build silently deploys nothing (e.g. from a bad `--prebuilt` cache or a transient remote-build issue), the build log shows a giveaway: `Build Completed in [Nms]` with `N` in the tens of milliseconds, followed by `Skipping cache upload because no files were prepared`. Any real build here (`tsc` + `expo export --platform web`) takes several seconds at minimum. That deploys as `● Ready`, aliases fine, and both the web app and every `/api/*` route 404 — indistinguishable from the outside from a routing or DNS issue. To confirm before or after deploying: `npx vercel pull --yes --environment production && npx vercel build --prod --yes` reproduces the exact remote build locally; check `.vercel/output/functions/` actually contains a `.func` per `api/*.ts` file, and that `vercel deploy --prebuilt --prod`'s upload step reports a realistic file count (hundreds+, not double digits).

## Architecture

**Stack:** Expo/React Native (SDK 54, RN 0.81) + React Navigation (native-stack) + TanStack Query + Zustand, talking to Vercel serverless functions backed by Supabase (Postgres + pgvector) and the Vercel AI Gateway.

`package.json` has `"type": "module"` because `ai` and `@ai-sdk/gateway` are ESM-only — removing it breaks Vercel's bundling with `ERR_REQUIRE_ESM`.

### Models (`api/_shared/models.ts`)

Single source of truth for every model the backend calls — change models here, not per-file. These have already been swapped a few times as the AI Gateway's catalog changed; verify against the file rather than trusting this list:
- `VISION_MODEL` (`xai/grok-4.1-fast-non-reasoning`) — ingredient identification from the photo only; fast/non-reasoning tier since it's narrow structured extraction, not a task that benefits from chain-of-thought.
- `TEXT_MODEL` (`openai/gpt-5.4-nano`) — recipe metadata/step generation; cheap/fast since creativity depth barely matters here.
- `FALLBACK_MODEL` (`openai/gpt-5.4-mini`) — shared fallback for both vision and text calls if the primary fails.

### Startup: OTA update gate (`hooks/useAppUpdates.ts`)

`App.tsx` calls `useAppUpdates()` and renders nothing until it resolves. `expo-updates`' default `checkAutomatically` behavior always defers a downloaded update to the *next* cold start regardless of policy — there's no native knob for same-session adoption. This hook explicitly checks → fetches → `Updates.reloadAsync()`s so a published `eas update` takes effect on the very launch that detects it, each network call capped at 5s (`withTimeout`) and any error swallowed so a slow/offline network never blocks startup. Skipped entirely in `__DEV__` or when updates aren't enabled for the build.

Note the corollary: this only matters for **JS-only** changes pushed via `eas update`. Anything that changes native config or build-time-embedded values (`app.json` plugins, `EXPO_PUBLIC_*` env vars baked in via `eas.json`) requires a full `eas build` — an `eas update` will never pick those up no matter how this hook behaves.

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

### `POST /api/lookup-ingredients` (`api/lookup-ingredients.ts`)

Read-only counterpart to `update-ingredients`, called when the user *removes* a detected ingredient tag. Uses `findExistingIngredientSet` (`api/_shared/ingredientSets.ts`) — exact fingerprint, then fuzzy embedding match — but never generates: the fuzzy match is restricted to candidate sets whose ingredients are a subset of the (reduced) query, so dropping one ingredient can't silently snap back to the larger set the user just moved away from. Returns `{ matched: false }` on a miss rather than falling back to an LLM call.

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
- `EXPO_PUBLIC_API_URL` controls which backend the Expo app talks to; unset it (or point it at `http://localhost:3000`) for local `vercel dev`, or set it to the deployed Vercel URL for production/preview builds. It's compiled into the JS bundle at **build time**, not read at runtime — changing it and running `eas update` does nothing to already-installed builds; it only takes effect via a fresh `eas build` (see the `env` block under the `preview` profile in `eas.json`). If a build is inexplicably still hitting the wrong URL, extract the installed app's JS bundle (`unzip -p <apk> assets/index.android.bundle | grep <expected-url>`) to confirm what actually got baked in, rather than trusting the build log.
- `app.json`'s `plugins` array must list every native module that needs config-time setup — `expo-camera` and `expo-image-picker` (used by `CameraScreen.tsx`) are required there alongside `expo-video`, or the corresponding native permissions/config won't be generated into a new build.
- `components/VideoBackground.tsx` sets `surfaceType="textureView"` on Android's `VideoView` and re-plays on `AppState` → `'active'`. Android's default `SurfaceView` backing can lose its render surface across an app-switch (multitasking), leaving the looping landing-screen background video stuck on a stale frame or replaying only the first buffered segment until backgrounded/foregrounded again — `textureView` avoids the surface-teardown hazard, the `AppState` listener is a belt-and-suspenders resume.
