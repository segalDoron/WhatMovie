import { useCallback, useEffect, useRef, useState } from "react";
import type { Answers, Movie } from "./types";
import { describeSearch } from "./describeSearch";
import { needsKey, runAnalysis } from "./analysis";
import { keyStatus, useHasKey } from "./keyStatus";
import { useUserData } from "./userData";

export interface Insight {
  state: "loading" | "done";
  text: string;
}

const titles = (xs: { title: string }[]) => xs.slice(0, 15).map((m) => m.title);

/**
 * The AI take on a set of search results. It only runs when the user has saved their own Gemini key:
 * without one, start() does nothing and no request is made.
 */
export function useInsight() {
  const { favorites, votes } = useUserData();
  const hasKey = useHasKey();
  const [insight, setInsight] = useState<Insight | null>(null);
  const token = useRef(0); // an answer that arrives after a newer search (or a clear) is ignored

  const clear = useCallback(() => {
    token.current++;
    setInsight(null);
  }, []);

  // The key was removed, or the user signed out: drop what is shown.
  useEffect(() => {
    if (hasKey !== true) clear();
  }, [hasKey, clear]);

  const start = (answers: Answers, list: Movie[]) => {
    if (keyStatus.get() !== true) return; // no saved key: the analysis function is not used
    const mine = ++token.current;
    setInsight({ state: "loading", text: "" });
    runAnalysis({
      search: describeSearch(answers),
      results: list.slice(0, 12).map((m) => ({ title: m.title, year: m.year, genres: m.genres, score: m.score })),
      liked: titles(votes.like),
      disliked: titles(votes.dislike),
      favorites: titles(favorites),
    })
      .then((text) => {
        if (mine === token.current) setInsight({ state: "done", text });
      })
      .catch((e) => {
        if (mine !== token.current) return;
        if (needsKey(e)) keyStatus.set(false); // the saved key stopped working: stop using the function until it is fixed
        setInsight(null); // any other failure: show nothing
      });
  };

  return { insight: hasKey === true ? insight : null, start, clear };
}
