- **Smart Recipe Planner**
    
    You should build a mobile interface for this project using Expo.
    
    Users should be able to take a photo of ingredients and the app will show them a list of 5 recipes they can make with those ingredients. If they don’t like any of those recipes, they can refresh and get 5 new recipes. The recipes should not repeat from refresh to refresh.
    
    Upon finding a recipe they like, the user should be able to click into one of the recipes from the list and get the full recipe in a new screen.
    
    This should not be a chat interface. The recipe list and the recipes themselves should be highly structured.
    
### Submission Instructions

---

1. **Videos:** unlisted YouTube videos, 10 to 20 min (must be at least 10 min), no scripts and be yourself. Walk us through the following sections:
    1. Product demo - what you built, why, and the business impact (this should be less than half the video)
    2. Tech stack - what you picked and why
    3. Architectural decisions - the high-level design and the signals behind it
    4. Technical trade-offs - what you chose not to do, and what you'd do to production-ize or improve the system
2. **Ashby Submission**
    1. Please use the Ashby submission link provided in the initial instructions. If you did not receive a submission link, please follow the instructions below.
        1. YouTube video links
        2. Link to a **public** GitHub repo with a clear README.md explaining how to run/test the code
        3. Deployed/live link


### Decisions
- Having trouble approving AWS bedrock IAM credentials so had to temporarily use a long term API key instead
- JSON output is forced using Zod schema instead of relying onn propmt. 
- Using base64 of image for 'UID' to cache image
- used fuzzy embedding match to match (1) identified ingredeients with past ingredients and (2) prevent duplication in recipe generations being displayed
    - 0.9 and 0.92 embedding threashold are arbitary
    - embeddings uses AI SDK cosine similarity instead of pgvector index
- added if "imagetoodark" check
- aborts API call from MORE-RECIPES if changing food tags 
- limit to 100 requests per 30 minutes

Structured outputs: Force the model to return strict JSON (recipe name, time, difficulty, ingredients with quantities, steps) via tool-calling/schema constraints rather than parsing free text — shows you understand reliability issues with LLMs.
Ingredient confidence/correction step: After photo analysis, show detected ingredients and let the user confirm/edit before generating recipes — handles vision-model errors gracefully instead of pretending it's perfect.
Smart exclusion for refresh: Instead of just avoiding repeats, use embeddings or a diversity constraint so refreshed recipes are meaningfully different in cuisine/style, not just different names for the same dish.
Caching/cost awareness: Cache ingredient→recipe results, discuss latency/cost trade-offs of vision + generation calls in your video — this hits the "trajectory of LLMs" angle they mention wanting to see.
Offline-friendly UX: Skeleton loading states, graceful handling of a bad photo (blurry, no food detected).



### Tradeoffs
- recipe generating 30 at once takes a long time even with sonnet 4.6. These are also predetermined genres of food. Instead let us generate around 10, upon refresh then we will generate 20. This will slow down UI, but the intial image analysis (which includes generating the recipe) should be reduced signcantly (currently all front loading takes around 1-1.5m)
    - used a lightweight model like grok, but still struggling
        - did away with pre-caching idea to cover more recipe diversity - unnecessary token usage + adding more latency
            - Instead changing to only showing tags that are available from initially generated 30 recipes

- removed the option to generate to select cuisine tags out of intiially genearted 30 options - assuming unlikely for user to want so many recipes at once
    - instead just showing available tags from the intiially generated 30 recipes

- Not using highly capable analysis model like Meta SAM3 because unnecessary and resource intensive

- Nutrition/dietary filtering: Structured toggles (vegetarian, gluten-free, calorie target) that constrain generation.
    - Instead doing cuisine tags as ingreidents available are likely to be limited by dietary limitation already

- generates recipes, but embedding whether it's too reptetative. 
- Considered tinder style swipe out of better UI, but primarily minimizing feel of latency when loading new recipes, however original steps require 5 cards at a time and 5 new cards for renewal
- generating detailed recipes after clicking to prevent upfront latency and unneccessary tokens
- unable to generate a lot of new unsplash images - so instead searched by cuisine tags w/ repeated images
- not using streaming of text to reduce feel of AI at the tradeoff of latency

????
- can i use third party API to generate recipes or is that againt the assignment - would save time, money, and image relevancy while primarily reducing latency
    - but wouldn't generate obscure ingreident list - otherwise will just use existing apps


### improvements
- run LLM locally 
- consider hybrid API calling for recipes to reduce further latency
- implemenet more defined firewall rules specfic for vision to reduce constant expsnive hits - but grok costs for vision is pretty low 
    - currently at 10 requests/30 mins to call vision analyze function
    - ideally also recipes refresh limits

Endpoint	Heavy legit session	Limit	Why
POST /api/analyze	1–3 calls	10	Priciest by far — vision model + up to 20 recipe generations + image lookups on a cache miss
POST /api/more-recipes	5–15 calls	30	Triggers LLM generation, but a smaller batch (10–15) and no vision call
POST /api/update-ingredients	2–5 calls	20	Same generation path as analyze, smaller batch (10)
POST /api/lookup-ingredients	2–5 calls	60	Read-only — no generation, just an embedding call + DB read
GET /api/recipe	10–20 calls	200	Your most-frequent legit call (every card tap); generation only fires once ever per recipe ID, so abuse potential is naturally self-limiting