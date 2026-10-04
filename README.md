# Movie tonight

React + TypeScript + Vite, deployed on Vercel. A serverless route (`api/movies.ts`) keeps the TMDB key private.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and add `TMDB_API_KEY` (free: themoviedb.org/settings/api).
3. Run with `npx vercel dev` (needed so `/api/movies` works locally).
4. Deploy: push to GitHub, import in Vercel, add the same env vars in Project Settings.

## How it works
Answers become TMDB `discover` filters. Movie picks ("a movie you loved" and the this-or-that rows) use TMDB recommendations.

## Tweaks
- Palette: edit the CSS variables at the top of `src/styles.css`.
- `WATCH_REGION` (default `US`) controls streaming availability.
