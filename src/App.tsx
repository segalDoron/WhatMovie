import { useCallback, useEffect, useRef, useState } from "react";
import QuestionForm from "./QuestionForm";
import Loading from "./Loading";
import ResultsList from "./ResultsList";
import MovieDetail from "./MovieDetail";
import { fetchMovies } from "./api";
import type { Movie, View } from "./types";

type Theme = "light" | "dark";
type NavState = { view: "form" | "loading" | "results" | "error" | "detail"; id?: number };

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
 * UI back buttons call history.back(), so the native back button and the
 * UI always walk the same stack. popstate is the single place that updates the view.
 */
export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<View>("form");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState("");

  const moviesRef = useRef<Movie[]>([]);
  moviesRef.current = movies;
  const requestId = useRef(0); // lets us ignore a search that was navigated away from

  useEffect(() => {
    // The page always starts at the search form, even after a refresh.
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    history.replaceState({ view: "form" } satisfies NavState, "");

    const onPopState = (e: PopStateEvent) => {
      requestId.current++; // cancel any in-flight search
      const s = e.state as NavState | null;
      const list = moviesRef.current;

      if (s?.view === "detail") {
        const m = list.find((x) => x.id === s.id);
        if (m) {
          setSelected(m);
          setDetailOpen(true);
          setView("results");
          return;
        }
      }
      if (s?.view === "results" && list.length) {
        setDetailOpen(false);
        setView("results");
        return;
      }
      if (s?.view === "error") {
        setDetailOpen(false);
        setView("error");
        return;
      }
      // form, a cancelled loading entry, or anything unknown
      setDetailOpen(false);
      setSelected(null);
      setView("form");
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

  const openDetail = (m: Movie) => {
    history.pushState({ view: "detail", id: m.id } satisfies NavState, "");
    setSelected(m);
    setDetailOpen(true);
  };

  return (
    <div className="app">
      <button className="theme" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      {view === "form" && <QuestionForm onSubmit={submit} />}
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
          <section className={`page detail-page ${detailOpen ? "in" : ""}`} aria-hidden={!detailOpen}>
            <MovieDetail movie={selected} tabbable={detailOpen} onBack={goBack} />
          </section>
        </div>
      )}
    </div>
  );
}
