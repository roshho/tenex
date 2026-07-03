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


### Remarks
- Having trouble approving AWS bedrock IAM credentials so had to temporarily use a long term API key instead


#### todo 
- implement bad lighting condition context
- improve UI
- consider implementing other methods of identifying grocery objects or asking users to retake image in better conditions
- cache 20 responses at once
- using aws bedrock to use other models if the first model struggless