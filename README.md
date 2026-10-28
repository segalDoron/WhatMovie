# Movie tonight

React + TypeScript + Vite, deployed on Vercel. A serverless route (`api/movies.ts`) keeps the TMDB key private.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and add `TMDB_API_KEY` (free: themoviedb.org/settings/api) and `GEMINI_API_KEY` (free: aistudio.google.com/apikey).
3. Run with `npx vercel dev` (needed so `/api/movies` works locally).
4. Deploy: push to GitHub, import in Vercel, add the same env vars in Project Settings.

## How it works
Answers become a search plan: rules first, then Gemini refines it (genres, clashing genres, theme keywords). If Gemini is unavailable the rules are used on their own. The plan is turned into TMDB `discover` filters and every result is checked again, looping through TMDB pages until 20 unique valid movies are found. Movie picks ("a movie you loved" and the this-or-that rows) use TMDB recommendations.

## Tweaks
- Palette: edit the CSS variables at the top of `src/styles.css`.
- `WATCH_REGION` (default `US`) controls streaming availability.
