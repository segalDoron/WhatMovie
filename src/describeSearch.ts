import { CORE, MORE } from "./options";
import type { Answers } from "./types";

const QUESTIONS = [...CORE, ...MORE];
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const labelsOf = (a: Answers, key: string): string[] => {
  const q = QUESTIONS.find((x) => x.key === key);
  return asList(a[key]).map((v) => q?.options.find(([val]) => val === v)?.[1] ?? "").filter(Boolean);
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A short human description of a saved search: a title plus the remaining choices. */
export function describeSearch(a: Answers): { title: string; details: string } {
  const head = [...labelsOf(a, "mood"), ...labelsOf(a, "genres")];
  const actor = String(a.actor ?? "").trim();
  const loved = String(a.loved ?? "").trim();

  let title = head.slice(0, 3).join(" · ");
  if (head.length > 3) title += ` +${head.length - 3}`;
  if (!title) title = loved ? `Like ${loved}` : actor ? `With ${actor}` : "Any movie";

  const parts = [
    ...["who", "tone", "time", "novelty", "energy"].flatMap((k) => labelsOf(a, k)),
    ...(labelsOf(a, "platform").length ? [`On ${labelsOf(a, "platform").join(", ")}`] : []),
    ...(labelsOf(a, "avoid").length ? [`Skip ${labelsOf(a, "avoid").join(", ").toLowerCase()}`] : []),
    ...(a.yearFrom && a.yearTo ? [`${a.yearFrom}–${a.yearTo}`] : []),
    ...(actor && title !== `With ${actor}` ? [`With ${actor}`] : []),
    ...(loved && title !== `Like ${loved}` ? [`Like ${loved}`] : []),
    ...(asList(a.seeds).length ? [plural(asList(a.seeds).length, "movie pick")] : []),
    ...(asList(a.taste).length ? [plural(asList(a.taste).length, "taste pick")] : []),
  ];
  return { title, details: parts.join(" · ") || "No filters" };
}
