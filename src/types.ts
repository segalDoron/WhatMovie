export interface Movie {
  id: number;
  title: string;
  genres: string[];
  year: string;
  score: number;
  poster: string | null;
  backdrop: string | null;
  overview: string;
}
export type Answers = Record<string, string | string[]>;
export type View = "form" | "loading" | "results" | "error";
