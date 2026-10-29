import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QuestionForm from "./QuestionForm";
import Loading from "./Loading";
import ResultsList from "./ResultsList";
import MovieDetail from "./MovieDetail";
import BottomSheet from "./BottomSheet";
import SideDrawer from "./SideDrawer";
import LoginModal from "./LoginModal";
import AccountModal from "./AccountModal";
import { getKeyStatus } from "./settingsApi";
import FavoritesContent from "./FavoritesContent";
import HistoryContent from "./HistoryContent";
import WatchedContent from "./WatchedContent";
import WatchlistTabs from "./WatchlistTabs";
import { WATCHED_GOAL, watchedProgress, type WatchlistTab } from "./watchlist";
import { Heart, ChevronRight, Clock, Close, Eye, User } from "./Icons";
import { useAuth } from "./AuthProvider";
import { useUserData, type Favorite, type SavedSearch } from "./userData";
import { useMediaQuery } from "./useMediaQuery";
import { preloadImages } from "./preload";
import { fetchMovies, fetchMore, fetchMovie, type Cursor, type Taste } from "./api";
import type { Answers, Movie, View } from "./types";
import "./styles-additions.css";
import "./watchlist.css";

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

type Source = "results" | "favorites" | "watched";
type Panel = WatchlistTab; // what the bottom sheet (mobile) / side drawer (desktop) is showing

// `inert` removes a hidden layer from tab order and screen readers.
const inertProps = (on: boolean): Record<string, string> => (on ? { inert: "" } : {});

const initialOf = (text: string): string => ([...text.trim()][0] ?? "").toUpperCase();

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
 * The favorites / recent searches sheet and drawer are plain UI state, not a history entry: it stays open while you move between
 * pages and closes only with its close button, the dimmed area outside it, or Escape (closing never changes the page).
 * UI back buttons call history.back(), so the native back button and the UI always walk the same stack.
 * popstate is the single place that updates the view.
 * The app works without signing in. The login modal can be closed; signed-out data stays on the page until refresh.
 */
export default function App() {
  const [theme, toggleTheme] = useTheme();
  const { user, loading: authLoading, expired, justSignedIn, ackSignIn } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountStart, setAccountStart] = useState<"account" | "settings">("account"); // which screen the account modal opens on
  // Signing out (from the account modal or elsewhere) closes them, so they do not reopen at the next sign-in.
  useEffect(() => {
    if (!user) setAccountOpen(false);
  }, [user]);
  // Right after a sign-in or sign-up, if no Gemini key is saved yet, open the add-key screen.
  const justSignedInRef = useRef(justSignedIn);
  justSignedInRef.current = justSignedIn;
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !justSignedInRef.current) return;
    let live = true;
    getKeyStatus()
      .then((s) => {
        if (!live) return;
        if (!s.hasKey) {
          setAccountStart("settings");
          setAccountOpen(true);
        }
        ackSignIn();
      })
      .catch(() => live && ackSignIn());
    return () => {
      live = false;
    };
  }, [userId, ackSignIn]);
  const { favorites, votes, watched, searches, addSearch, removeSearch, syncError, dismissSyncError } = useUserData();
  // The latest taste, read at the moment a search or "show more" is sent (newest first).
  const tasteRef = useRef<Taste>({ favorites: [], likes: [], dislikes: [], watched: [] });
  tasteRef.current = {
    favorites: favorites.map((m) => m.id),
    likes: votes.like.map((m) => m.id),
    dislikes: votes.dislike.map((m) => m.id),
    watched: watched.map((m) => m.id),
  };

  const [loginDismissed, setLoginDismissed] = useState(false);
  const loginOpen = !authLoading && !user && !loginDismissed;
  // An expired session brings the login modal back, even if it was closed earlier.
  useEffect(() => {
    if (expired) setLoginDismissed(false);
  }, [expired]);

  const profileFace = user?.email ? <span className="initial" aria-hidden="true">{initialOf(user.email)}</span> : <User />;
  const profileLabel = user?.email ? `Account: ${user.email}` : "Sign in";
  const onAccount = () => {
    if (!user) return setLoginDismissed(false);
    setAccountStart("account");
    setAccountOpen(true);
  };

  const [view, setView] = useState<View>("form");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [sortByRating, setSortByRating] = useState(false); // list order: best match first, or highest rating first
  const [cursor, setCursor] = useState<Cursor | null>(null); // where "show more" continues; null = nothing more to load
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreMessage, setMoreMessage] = useState("");
  const [selected, setSelected] = useState<Movie | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [opening, setOpening] = useState(false); // waiting for a details page's images
  const [panel, setPanel] = useState<Panel | null>(null); // which list is open (plain UI state, stays open until closed)
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const drawerShown = panel !== null && isDesktop; // desktop: side drawer
  const lastPanel = useRef<Panel>("favorites"); // keeps the content visible while the panel slides out
  if (panel) lastPanel.current = panel;
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
  const pendingSearch = useRef<Answers | null>(null); // a search to run as soon as we are back on the form
  const submitRef = useRef<(answers: Answers) => void>(() => {});

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
        const pending = pendingSearch.current;
        if (pending) {
          pendingSearch.current = null;
          submitRef.current(pending);
        }
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      history.scrollRestoration = prev;
    };
  }, []);

  const goBack = useCallback(() => history.back(), []);
  // Jump straight back to the search form, however deep we are.
  const startOver = useCallback(() => {
    const n = curIdx();
    if (n > 0) history.go(-n);
  }, []);

  const submit: React.ComponentProps<typeof QuestionForm>["onSubmit"] = async (answers) => {
    const id = ++requestId.current;
    addSearch(answers); // keeps the last 10 searches
    pushNav({ view: "loading" });
    setView("loading");
    try {
      const result = await fetchMovies(answers, tasteRef.current);
      if (id !== requestId.current) return; // user went back while loading
      answersRef.current = answers;
      moreToken.current++;
      setMovies(result.movies);
      setSortByRating(false);
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

  submitRef.current = submit;

  // Run a saved search again through the regular flow. From any other screen, first go back to the form.
  const rerun = (s: SavedSearch) => {
    setPanel(null);
    if (curIdx() > 0) {
      pendingSearch.current = s.answers;
      startOver();
    } else submit(s.answers);
  };

  const loadMore = async () => {
    if (cursor === null || loadingMore) return;
    const token = moreToken.current;
    setLoadingMore(true);
    setMoreMessage("");
    try {
      const r = await fetchMore(answersRef.current, cursor, movies.map((m) => m.id), tasteRef.current);
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
  // What the list shows, in order. "Next movie" follows the same order.
  const shownMovies = useMemo(() => (sortByRating ? [...movies].sort((a, b) => b.score - a.score) : movies), [movies, sortByRating]);
  const listOf = (src: Source): { id: number }[] => (src === "favorites" ? favorites : src === "watched" ? watched : shownMovies);
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

  // Menu bar / top buttons: open a list, switch to the other one, or close it, without leaving the current page.
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const closePanel = () => setPanel(null);

  // A favorite only stores the basics, so fetch the full details from TMDB first (with a loader).
  const openSaved = async (fav: Favorite, source: "favorites" | "watched") => {
    const id = ++favRequest.current;
    setFavLoading(true);
    setFavError("");
    try {
      const m = movieCache.current.get(fav.id) ?? (await fetchMovie(fav.id));
      if (id !== favRequest.current) return; // sheet / drawer action was cancelled meanwhile
      await openDetail(m, source, { silent: true }); // also waits for the image; the sheet / drawer stays open underneath
      if (id === favRequest.current) setFavLoading(false);
    } catch {
      if (id !== favRequest.current) return;
      setFavLoading(false);
      setFavError("Couldn't load this movie. Check your connection and try again.");
    }
  };

  const shownPanel = panel ?? lastPanel.current;
  const panelLabel = shownPanel === "history" ? "Recent searches" : shownPanel === "watched" ? "Watched" : "Favorites";
  const panelBody = (
    <div className="watch-panel">
      <WatchlistTabs value={shownPanel} onChange={setPanel} />
      {shownPanel === "history" ? (
        <HistoryContent items={searches} onClose={closePanel} onPick={rerun} onRemove={removeSearch} />
      ) : shownPanel === "watched" ? (
        <WatchedContent items={watched} loading={favLoading} error={favError} onClose={closePanel} onPick={(m) => openSaved(m, "watched")} />
      ) : (
        <FavoritesContent items={favorites} loading={favLoading} error={favError} onClose={closePanel} onPick={(m) => openSaved(m, "favorites")} />
      )}
    </div>
  );

  return (
    <div className={`app ${drawerShown ? "drawer-open" : ""}`} {...inertProps(loginOpen || accountOpen)}>
      <div className="main">
        <div className="viewport">
          <button className="theme" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {isDesktop && (
            <>
              <button className="profile-top" onClick={onAccount} aria-haspopup="dialog" aria-label={profileLabel}>
                {profileFace}
              </button>
              <button
                className="hist-top"
                onClick={() => togglePanel("history")}
                aria-pressed={panel === "history"}
                aria-label={panel === "history" ? "Close recent searches" : "Open recent searches"}
              >
                <Clock />
              </button>
              <button
                className="fav-top"
                onClick={() => togglePanel("favorites")}
                aria-pressed={panel === "favorites"}
                aria-label={`${panel === "favorites" ? "Close" : "Open"} favorites (${favorites.length})`}
              >
                <Heart filled={panel === "favorites" || favorites.length > 0} />
                {favorites.length > 0 && <span className="badge" aria-hidden="true">{favorites.length}</span>}
              </button>
              <button
                className="watched-top"
                onClick={() => togglePanel("watched")}
                aria-pressed={panel === "watched"}
                aria-label={`${panel === "watched" ? "Close" : "Open"} watched (${watched.length})`}
              >
                <Eye />
                {watched.length > 0 && <span className="badge" aria-hidden="true">{watched.length}</span>}
              </button>
            </>
          )}

          {detailOpen && (
            <button className="next-top" onClick={goNext} disabled={nextId === null} aria-label="Next movie">
              <ChevronRight />
            </button>
          )}

          {view === "form" && (
            <div className="layer" {...inertProps(detailOpen)}>
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
              <section className={`page list-page ${detailOpen ? "away" : ""}`} aria-hidden={detailOpen} {...inertProps(detailOpen)}>
                <ResultsList
                  movies={shownMovies}
                  tabbable={!detailOpen}
                  onStartOver={startOver}
                  onOpen={(m) => openDetail(m, "results")}
                  hasMore={cursor !== null}
                  loadingMore={loadingMore}
                  moreMessage={moreMessage}
                  onMore={loadMore}
                  sorted={sortByRating}
                  onToggleSort={() => setSortByRating((v) => !v)}
                />
              </section>
            </div>
          )}

          <section ref={detailRef} className={`page detail-page ${detailOpen ? "in" : ""}`} aria-hidden={!detailOpen}>
            <MovieDetail movie={selected} open={detailOpen} tabbable={detailOpen} onBack={goBack} onStartOver={startOver} />
          </section>

          {opening && (
            <div className="busy" role="status" aria-label="Loading movie">
              <div className="spinner" />
            </div>
          )}
        </div>

        {syncError && (
          <div className="sync-note" role="status">
            <span>{syncError}</span>
            <button className="x" onClick={dismissSyncError} aria-label="Dismiss">
              <Close />
            </button>
          </div>
        )}

        {/* Mobile only: menu bar on every screen, above the sheet and the details page. Buttons are spread evenly. */}
        {!isDesktop && (
          <nav className="menu" aria-label="Main menu">
            <button
              type="button"
              className="menu-btn"
              onClick={() => togglePanel("history")}
              disabled={view === "loading"}
              aria-expanded={panel === "history"}
              aria-label="Recent searches"
            >
              <Clock />
            </button>
            <button
              type="button"
              className="menu-btn"
              onClick={() => togglePanel("favorites")}
              disabled={view === "loading"}
              aria-expanded={panel === "favorites"}
              aria-label={`Favorites (${favorites.length})`}
            >
              <Heart filled={favorites.length > 0} />
              {favorites.length > 0 && <span className="badge" aria-hidden="true">{favorites.length}</span>}
            </button>
            <button
              type="button"
              className="menu-btn watch-btn"
              onClick={() => togglePanel("watched")}
              disabled={view === "loading"}
              aria-expanded={panel === "watched"}
              aria-label={`Watched (${watched.length} of ${WATCHED_GOAL})`}
            >
              <svg className="watch-ring" viewBox="0 0 40 40" aria-hidden="true">
                <circle className="ring-track" cx="20" cy="20" r="17" />
                <circle
                  className="ring-fill"
                  cx="20"
                  cy="20"
                  r="17"
                  pathLength={100}
                  strokeDasharray={`${Math.round(watchedProgress(watched.length) * 100)} 100`}
                />
              </svg>
              <Eye />
            </button>
            <button type="button" className="menu-btn" onClick={onAccount} aria-haspopup="dialog" aria-label={profileLabel}>
              {profileFace}
            </button>
          </nav>
        )}
      </div>

      {isDesktop ? (
        <SideDrawer open={panel !== null} label={panelLabel}>{panelBody}</SideDrawer>
      ) : (
        <BottomSheet open={panel !== null} label={panelLabel}>{panelBody}</BottomSheet>
      )}

      {loginOpen && <LoginModal expired={expired} onDismiss={() => setLoginDismissed(true)} />}
      {accountOpen && user && <AccountModal initialView={accountStart} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
