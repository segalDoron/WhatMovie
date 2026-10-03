import { useEffect, useState } from "react";
import QuestionForm from "./QuestionForm";
import Loading from "./Loading";
import ResultsList from "./ResultsList";
import MovieDetail from "./MovieDetail";
import { fetchMovies } from "./api";
import type { Movie, View } from "./types";

type Theme = "light" | "dark";

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

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<View>("form");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState("");

  const submit: React.ComponentProps<typeof QuestionForm>["onSubmit"] = async (payload) => {
    setView("loading");
    try {
      setMovies(await fetchMovies(payload));
      setView("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setView("error");
    }
  };

  const startOver = () => {
    setDetailOpen(false);
    setSelected(null);
    setView("form");
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
          <button className="primary" onClick={startOver}>Start over</button>
        </div>
      )}

      {view === "results" && (
        <div className="stage">
          <section className={`page list-page ${detailOpen ? "away" : ""}`} aria-hidden={detailOpen}>
            <ResultsList
              movies={movies}
              tabbable={!detailOpen}
              onStartOver={startOver}
              onOpen={(m) => { setSelected(m); setDetailOpen(true); }}
            />
          </section>
          <section className={`page detail-page ${detailOpen ? "in" : ""}`} aria-hidden={!detailOpen}>
            <MovieDetail movie={selected} tabbable={detailOpen} onBack={() => setDetailOpen(false)} />
          </section>
        </div>
      )}
    </div>
  );
}
