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

## Matrics
select * from rec_rates_by_position; shows like, dislike, and favorite rates for positions 1–5, 6–10, 11–20, and so on. If personalization works, the top positions should be liked more than the lower ones.
select * from rec_rates_by_tmdb_order; shows the same by the order TMDB returned the movies in. Compare it with the table above to see whether your ranking beats TMDB’s default order.
select * from rec_performance; shows daily searches, average and slowest time to the first 20, and TMDB and Gemini calls.
select * from rec_diversity; shows the variety of the pages.
