import { useCallback, useEffect, useRef, useState } from "react";
import QuestionForm from "./QuestionForm";
import Loading from "./Loading";
import ResultsList from "./ResultsList";
import MovieDetail from "./MovieDetail";
import FavoritesSheet from "./FavoritesSheet";
import { useFavorites } from "./useFavorites";
import { fetchMovies, fetchMovie } from "./api";
import type { Favorite } from "./favorites";
import type { Movie, View } from "./types";

type Theme = "light" | "dark";
type NavState = { view: "form" | "loading" | "results" | "error" | "detail" | "favorites"; id?: number };

// `inert` removes a hidden layer from tab order and screen readers.
const inertProps = (on: boolean): Record<string, string> => (on ? { inert: "" } : {});

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    return saved ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

/*
 * History stack: form -> (loading, replaced by) results -> detail
 *                form -> favorites (sheet) -> detail
 * UI back/close buttons call history.back(), so the native back button and the UI
 * always walk the same stack. popstate is the single place that updates the view.
 */
export default function App() {
  const [theme, toggleTheme] = useTheme();
  const favorites = useFavorites();
  const [view, setView] = useState<View>("form");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState("");
  const [error, setError] = useState("");

  const moviesRef = useRef<Movie[]>([]);
  moviesRef.current = movies;
  const movieCache = useRef(new Map<number, Movie>()); // every movie opened this session (for back/forward)
  const requestId = useRef(0); // ignore a search that was navigated away from
  const favRequest = useRef(0); // ignore a favorite fetch that was cancelled

  useEffect(() => {
    // The page always starts at the search form, even after a refresh.
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    history.replaceState({ view: "form" } satisfies NavState, "");

    const onPopState = (e: PopStateEvent) => {
      requestId.current++;
      favRequest.current++;
      setFavLoading(false);
      setFavError("");
      const s = e.state as NavState | null;

      if (s?.view === "detail") {
        const m = movieCache.current.get(s.id ?? -1);
        if (m) {
          setSelected(m);
          setDetailOpen(true); // whatever is underneath stays as it was
          return;
        }
      }
      setDetailOpen(false);
      if (s?.view === "favorites") {
        setSheetOpen(true);
        return;
      }
      setSheetOpen(false);
      if (s?.view === "results" && moviesRef.current.length) setView("results");
      else if (s?.view === "error") setView("error");
      else setView("form");
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      history.scrollRestoration = prev;
    };
  }, []);

  const goBack = useCallback(() => history.back(), []);

  const submit: React.ComponentProps<typeof QuestionForm>["onSubmit"] = async (payload) => {
    const id = ++requestId.current;
    history.pushState({ view: "loading" } satisfies NavState, "");
    setView("loading");
    try {
      const result = await fetchMovies(payload);
      if (id !== requestId.current) return; // user went back while loading
      setMovies(result);
      history.replaceState({ view: "results" } satisfies NavState, "");
      setView("results");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong");
      history.replaceState({ view: "error" } satisfies NavState, "");
      setView("error");
    }
  };

  const openDetail = (m: Movie, replace = false) => {
    movieCache.current.set(m.id, m);
    const state = { view: "detail", id: m.id } satisfies NavState;
    if (replace) history.replaceState(state, "");
    else history.pushState(state, "");
    setSelected(m);
    setDetailOpen(true);
  };

  const openSheet = () => {
    history.pushState({ view: "favorites" } satisfies NavState, "");
    setSheetOpen(true);
  };

  // Opening a favorite closes the sheet. The detail replaces the sheet's history entry,
  // so back from the details returns to the search page (not to a reopened sheet).
  const showFavorite = (m: Movie) => {
    setSheetOpen(false);
    openDetail(m, true);
  };

  // A favorite only stores the basics, so fetch the full details from TMDB first (with a loader).
  const openFavorite = async (fav: Favorite) => {
    const cached = movieCache.current.get(fav.id);
    if (cached) return showFavorite(cached);

    const id = ++favRequest.current;
    setFavLoading(true);
    setFavError("");
    try {
      const m = await fetchMovie(fav.id);
      if (id !== favRequest.current) return; // sheet was closed meanwhile
      setFavLoading(false);
      showFavorite(m);
    } catch {
      if (id !== favRequest.current) return;
      setFavLoading(false);
      setFavError("Couldn't load this movie. Check your connection and try again.");
    }
  };

  return (
    <div className="app">
      <button className="theme" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      {view === "form" && (
        <div className="layer" {...inertProps(sheetOpen || detailOpen)}>
          <QuestionForm onSubmit={submit} onOpenFavorites={openSheet} />
        </div>
      )}
      {view === "loading" && <Loading />}
      {view === "error" && (
        <div className="loading">
          <p>{error}</p>
          <button className="primary" onClick={goBack}>Start over</button>
        </div>
      )}

      {view === "results" && (
        <div className="stage">
          <section className={`page list-page ${detailOpen ? "away" : ""}`} aria-hidden={detailOpen}>
            <ResultsList movies={movies} tabbable={!detailOpen} onStartOver={goBack} onOpen={openDetail} />
          </section>
        </div>
      )}

      <FavoritesSheet
        open={sheetOpen}
        items={favorites}
        loading={favLoading}
        error={favError}
        onClose={goBack}
        onPick={openFavorite}
      />

      <section className={`page detail-page ${detailOpen ? "in" : ""}`} aria-hidden={!detailOpen}>
        <MovieDetail movie={selected} tabbable={detailOpen} onBack={goBack} />
      </section>
    </div>
  );
}
