# Movie tonight

React + TypeScript + Vite, deployed on Vercel. A serverless route (`api/movies.ts`) keeps the keys private.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and add:
   - `TMDB_API_KEY` (free: themoviedb.org/settings/api)
   - `GEMINI_API_KEY` (free: aistudio.google.com/apikey)
3. Run with `npx vercel dev` (needed so `/api/movies` works locally).
4. Deploy: push to GitHub, import in Vercel, add the same env vars in Project Settings.

## How it works
- Question mode: answers become TMDB `discover` filters (a "movie you loved" uses TMDB recommendations).
- Free-text mode: Gemini gets `what movie should I watch based on: <input>` and returns titles; TMDB adds posters, genres, year and score.

## Tweaks
- Palette: edit the CSS variables at the top of `src/styles.css`.
- `WATCH_REGION` (default `US`) controls streaming availability.
