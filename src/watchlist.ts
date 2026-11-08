export type WatchlistTab = "history" | "favorites" | "watched";

/** Target for the watched progress (mobile menu ring and the Watched tab). Change this number to change the goal. */
export const WATCHED_GOAL = 50;

/** 0 to 1 share of the goal reached. */
export const watchedProgress = (count: number): number => Math.min(1, Math.max(0, count / WATCHED_GOAL));
