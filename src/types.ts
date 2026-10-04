export interface Movie {
  id: number;
  title: string;
  genres: string[];
  year: string;
  score: number;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  rating?: string; // age certification, e.g. "PG-13"
}
export type Answers = Record<string, string | string[]>;
export type View = "form" | "loading" | "results" | "error";
