import { useCallback, useEffect, useRef, useState } from "react";
import QuestionForm from "./QuestionForm";
import Loading from "./Loading";
import ResultsList from "./ResultsList";
import MovieDetail from "./MovieDetail";
import FavoritesSheet from "./FavoritesSheet";
import FavoritesDrawer from "./FavoritesDrawer";
import { Heart, ChevronRight } from "./Icons";
import { useFavorites } from "./useFavorites";
import { useMediaQuery } from "./useMediaQuery";
import { preloadImages } from "./preload";
import { fetchMovies, fetchMore, fetchMovie, type Cursor } from "./api";
import type { Favorite } from "./favorites";
import type { Answers, Movie, View } from "./types";

type Theme = "light" | "dark";
type NavState = {
  view: "form" | "loading" | "results" | "error" | "detail";
  id?: number;
  idx?: number; // distance from the search form entry, so "Start over" can jump straight back to it
};

// History helpers: every entry remembers how deep it is.
const curIdx = () => (history.state as NavState | null)?.idx ?? 0;
const pushNav = (s: Omit<NavState, "idx">) => history.pushState({ ...s, idx: curIdx() + 1 } as NavState, "");
const replaceNav = (s: Omit<NavState, "idx">) => history.replaceState({ ...s, idx: curIdx() } as NavState, "");

type Source = "results" | "favorites";

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
 * The favorites sheet / drawer is plain UI state, not a history entry: it stays open while you move between
 * pages and closes only with its close button, the dimmed area outside it, or Escape (closing never changes the page).
 * UI back buttons call history.back(), so the native back button and the UI always walk the same stack.
 * popstate is the single place that updates the view.
 */
export default function App() {
  const [theme, toggleTheme] = useTheme();
  const favorites = useFavorites();
  const [view, setView] = useState<View>("form");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null); // where "show more" continues; null = nothing more to load
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreMessage, setMoreMessage] = useState("");
  const [selected, setSelected] = useState<Movie | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [opening, setOpening] = useState(false); // waiting for a details page's images
  const [sheetOpen, setSheetOpen] = useState(false); // mobile bottom sheet (plain UI state)
  const [drawerOpen, setDrawerOpen] = useState(false); // desktop drawer (plain UI state, stays open until closed)
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const sheetShown = sheetOpen && !isDesktop;
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState("");
  const [error, setError] = useState("");

  const moviesRef = useRef<Movie[]>([]);
  moviesRef.current = movies;
  const movieCache = useRef(new Map<number, Movie>()); // every movie opened this session (for back/forward)
  const requestId = useRef(0); // ignore a search that was navigated away from
  const favRequest = useRef(0); // ignore a favorite fetch that was cancelled
  const answersRef = useRef<Answers>({}); // the answers behind the current results (needed for "show more")
  const moreToken = useRef(0); // ignore a "show more" answer that arrives after a new search or "start over"
  const openRequest = useRef(0); // ignore a details page whose images arrive after the user moved on
  const detailSource = useRef(new Map<number, Source>()); // which list each opened movie came from (for "next")
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 }); // a new movie always starts at the top
  }, [selected?.id]);

  useEffect(() => {
    // The page always starts at the search form, even after a refresh.
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    history.replaceState({ view: "form", idx: 0 } as NavState, "");

    const onPopState = (e: PopStateEvent) => {
      requestId.current++;
      favRequest.current++;
      openRequest.current++;
      setFavLoading(false);
      setFavError("");
      setOpening(false);
      const s = e.state as NavState | null;

      if (s?.view === "detail") {
        const m = movieCache.current.get(s.id ?? -1);
        if (m) {
          setSelected(m);
          setDetailOpen(true);
          return;
        }
      }
      setDetailOpen(false);
      if (s?.view === "results" && moviesRef.current.length) setView("results");
      else if (s?.view === "error") setView("error");
      else {
        moreToken.current++;
        setLoadingMore(false);
        setView("form");
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      history.scrollRestoration = prev;
    };
  }, []);

  useEffect(() => {
    if (isDesktop) setSheetOpen(false); // the sheet only exists on mobile
  }, [isDesktop]);

  const goBack = useCallback(() => history.back(), []);
  // Jump straight back to the search form, however deep we are.
  const startOver = useCallback(() => {
    const n = curIdx();
    if (n > 0) history.go(-n);
  }, []);

  const submit: React.ComponentProps<typeof QuestionForm>["onSubmit"] = async (answers) => {
    const id = ++requestId.current;
    pushNav({ view: "loading" });
    setView("loading");
    try {
      const result = await fetchMovies(answers);
      if (id !== requestId.current) return; // user went back while loading
      answersRef.current = answers;
      moreToken.current++;
      setMovies(result.movies);
      setCursor(result.cursor);
      setLoadingMore(false);
      setMoreMessage("");
      replaceNav({ view: "results" });
      setView("results");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong");
      replaceNav({ view: "error" });
      setView("error");
    }
  };

  const loadMore = async () => {
    if (cursor === null || loadingMore) return;
    const token = moreToken.current;
    setLoadingMore(true);
    setMoreMessage("");
    try {
      const r = await fetchMore(answersRef.current, cursor, movies.map((m) => m.id));
      if (token !== moreToken.current) return;
      const have = new Set(movies.map((m) => m.id));
      const fresh = r.movies.filter((m) => !have.has(m.id));
      setMovies((prev) => [...prev, ...fresh]);
      setCursor(r.cursor);
      if (!fresh.length && !r.cursor) setMoreMessage("That's everything we found.");
    } catch {
      if (token === moreToken.current) setMoreMessage("Couldn't load more. Tap Show more to try again.");
    } finally {
      if (token === moreToken.current) setLoadingMore(false);
    }
  };

  // The details page only appears once its main image is loaded, so nothing jumps.
  // `replace` swaps the current details entry (used by "next") so Back still returns to the list.
  const openDetail = async (m: Movie, source: Source, opts: { silent?: boolean; replace?: boolean } = {}) => {
    const id = ++openRequest.current;
    if (!opts.silent) setOpening(true);
    await preloadImages([m.backdrop ?? m.poster]);
    if (id !== openRequest.current) return; // the user navigated away meanwhile
    setOpening(false);
    movieCache.current.set(m.id, m);
    detailSource.current.set(m.id, source);
    (opts.replace ? replaceNav : pushNav)({ view: "detail", id: m.id });
    setSelected(m);
    setDetailOpen(true);
  };

  // The movie after the current one in the list it was opened from.
  const sourceOf = (m: Movie): Source => detailSource.current.get(m.id) ?? "results";
  const listOf = (src: Source): { id: number }[] => (src === "favorites" ? favorites : movies);
  const nextId = (() => {
    if (!selected) return null;
    const list = listOf(sourceOf(selected));
    const i = list.findIndex((x) => x.id === selected.id);
    return i >= 0 && i < list.length - 1 ? list[i + 1].id : null;
  })();

  const goNext = async () => {
    if (nextId === null || !selected) return;
    const source = sourceOf(selected);
    const cached = movieCache.current.get(nextId);
    if (cached) return openDetail(cached, source, { replace: true });
    const token = ++openRequest.current;
    setOpening(true);
    try {
      const m = await fetchMovie(nextId); // favorites only keep the basics, so fetch the full details
      if (token !== openRequest.current) return;
      await openDetail(m, source, { replace: true });
    } catch {
      if (token === openRequest.current) setOpening(false);
    }
  };

  // Heart in the mobile menu bar: opens / closes the sheet without leaving the current page.
  const toggleSheet = () => setSheetOpen((o) => !o);

  // A favorite only stores the basics, so fetch the full details from TMDB first (with a loader).
  const openFavorite = async (fav: Favorite) => {
    const id = ++favRequest.current;
    setFavLoading(true);
    setFavError("");
    try {
      const m = movieCache.current.get(fav.id) ?? (await fetchMovie(fav.id));
      if (id !== favRequest.current) return; // sheet / drawer action was cancelled meanwhile
      await openDetail(m, "favorites", { silent: true }); // also waits for the image; the sheet / drawer stays open underneath
      if (id === favRequest.current) setFavLoading(false);
    } catch {
      if (id !== favRequest.current) return;
      setFavLoading(false);
      setFavError("Couldn't load this movie. Check your connection and try again.");
    }
  };

  return (
    <div className={`app ${isDesktop && drawerOpen ? "drawer-open" : ""}`}>
      <div className="main">
        <div className="viewport">
          <button className="theme" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {isDesktop && (
            <button
              className="fav-top"
              onClick={() => setDrawerOpen((o) => !o)}
              aria-pressed={drawerOpen}
              aria-label={`${drawerOpen ? "Close" : "Open"} favorites (${favorites.length})`}
            >
              <Heart filled={drawerOpen || favorites.length > 0} />
              {favorites.length > 0 && <span className="badge" aria-hidden="true">{favorites.length}</span>}
            </button>
          )}

          {detailOpen && (
            <button className="next-top" onClick={goNext} disabled={nextId === null} aria-label="Next movie">
              <ChevronRight />
            </button>
          )}

          {view === "form" && (
            <div className="layer" {...inertProps(sheetShown || detailOpen)}>
              <QuestionForm onSubmit={submit} />
            </div>
          )}
          {view === "loading" && <Loading />}
          {view === "error" && (
            <div className="loading">
              <p>{error}</p>
              <button className="primary" onClick={startOver}>Start over</button>
            </div>
          )}

          {view === "results" && (
            <div className="stage">
              <section className={`page list-page ${detailOpen ? "away" : ""}`} aria-hidden={detailOpen} {...inertProps(sheetShown || detailOpen)}>
                <ResultsList
                  movies={movies}
                  tabbable={!detailOpen && !sheetShown}
                  onStartOver={startOver}
                  onOpen={(m) => openDetail(m, "results")}
                  hasMore={cursor !== null}
                  loadingMore={loadingMore}
                  moreMessage={moreMessage}
                  onMore={loadMore}
                />
              </section>
            </div>
          )}

          <section ref={detailRef} className={`page detail-page ${detailOpen ? "in" : ""}`} aria-hidden={!detailOpen} {...inertProps(sheetShown)}>
            <MovieDetail movie={selected} tabbable={detailOpen} onBack={goBack} onStartOver={startOver} />
          </section>

          {opening && (
            <div className="busy" role="status" aria-label="Loading movie">
              <div className="spinner" />
            </div>
          )}
        </div>

        {/* Mobile only: menu bar on every screen, above the sheet and the details page. */}
        {!isDesktop && (
          <nav className="menu" aria-label="Main menu">
            <button
              type="button"
              className="menu-btn"
              onClick={toggleSheet}
              disabled={view === "loading"}
              aria-expanded={sheetOpen}
              aria-label={`Favorites (${favorites.length})`}
            >
              <Heart filled={favorites.length > 0} />
              {favorites.length > 0 && <span className="badge" aria-hidden="true">{favorites.length}</span>}
            </button>
          </nav>
        )}
      </div>

      {isDesktop ? (
        <FavoritesDrawer
          open={drawerOpen}
          items={favorites}
          loading={favLoading}
          error={favError}
          onClose={() => setDrawerOpen(false)}
          onPick={openFavorite}
        />
      ) : (
        <FavoritesSheet
          open={sheetOpen}
          items={favorites}
          loading={favLoading}
          error={favError}
          onClose={() => setSheetOpen(false)}
          onPick={openFavorite}
        />
      )}
    </div>
  );
}
