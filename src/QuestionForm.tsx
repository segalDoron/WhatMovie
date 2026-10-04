import { useState } from "react";
import { CORE, MORE, type Question } from "./options";
import { MOVIE_PAIRS, TASTE_PAIRS } from "./pairs";
import YearRange, { MIN_YEAR, MAX_YEAR } from "./YearRange";
import ThisOrThat, { type Side } from "./ThisOrThat";
import { useFavorites } from "./useFavorites";
import { Heart } from "./Icons";
import type { Answers } from "./types";

const MAX = 80;

interface Props {
  onSubmit: (p: { mode: "text"; input: string } | { mode: "answers"; answers: Answers }) => void;
  onOpenFavorites: () => void;
}

export default function QuestionForm({ onSubmit, onOpenFavorites }: Props) {
  const favCount = useFavorites().length;
  const [answers, setAnswers] = useState<Answers>({});
  const [years, setYears] = useState<[number, number]>([MIN_YEAR, MAX_YEAR]);
  const [picks, setPicks] = useState<Record<string, Side>>({});
  const [showMore, setShowMore] = useState(false);
  const [freeText, setFreeText] = useState(false);
  const [text, setText] = useState("");

  const pick = (q: Question, v: string) =>
    setAnswers((a) => {
      if (!q.multi) return { ...a, [q.key]: a[q.key] === v ? "" : v };
      const cur = (a[q.key] as string[]) ?? [];
      return { ...a, [q.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const pickSide = (key: string, side: Side) =>
    setPicks((p) => {
      const next = { ...p };
      if (next[key] === side) delete next[key];
      else next[key] = side;
      return next;
    });

  const isOn = (q: Question, v: string) =>
    q.multi ? ((answers[q.key] as string[]) ?? []).includes(v) : answers[q.key] === v;

  const setText1 = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAnswers((a) => ({ ...a, [key]: e.target.value }));

  const renderQ = (q: Question) => (
    <fieldset key={q.key} className="q" disabled={freeText}>
      <legend>{q.label}</legend>
      <div className="chips">
        {q.options.map(([v, label]) => (
          <button key={v} type="button" className="chip" aria-pressed={isOn(q, v)} onClick={() => pick(q, v)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const buildAnswers = (): Answers => {
    const seeds: string[] = [];
    const taste: string[] = [];
    for (const p of MOVIE_PAIRS) if (picks[p.key]) seeds.push(p[picks[p.key]].value);
    for (const p of TASTE_PAIRS) if (picks[p.key]) taste.push(p[picks[p.key]].value);
    const out: Answers = { ...answers, seeds, taste };
    if (years[0] !== MIN_YEAR || years[1] !== MAX_YEAR) {
      out.yearFrom = String(years[0]);
      out.yearTo = String(years[1]);
    }
    return out;
  };

  const canSubmit = freeText ? text.trim().length > 0 : true;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(freeText ? { mode: "text", input: text.trim() } : { mode: "answers", answers: buildAnswers() });
      }}
    >
      <h1>What are we watching tonight?</h1>

      <div className="free-toggle">
        <label className="switch">
          <input type="checkbox" role="switch" checked={freeText} onChange={(e) => setFreeText(e.target.checked)} />
          <span className="track" aria-hidden="true" />
          <span>Describe it in my own words</span>
        </label>
        {freeText && (
          <div className="free-input">
            <input
              type="text"
              value={text}
              maxLength={MAX}
              autoFocus
              placeholder="e.g. a feel-good road trip movie"
              onChange={(e) => setText(e.target.value)}
              aria-label="Describe the movie you want"
            />
            <span className="count">{text.length}/{MAX}</span>
          </div>
        )}
      </div>

      {CORE.map(renderQ)}

      <button type="button" className="link" onClick={() => setShowMore((s) => !s)} disabled={freeText} aria-expanded={showMore}>
        {showMore ? "Fewer options" : "More options"}
      </button>

      <div className={`more-wrap ${showMore && !freeText ? "open" : ""}`}>
        <div className="more-inner">
          <div className="more">
            {MORE.map(renderQ)}

            <fieldset className="q" disabled={freeText}>
              <legend>Release years</legend>
              <YearRange value={years} onChange={setYears} />
            </fieldset>

            <fieldset className="q" disabled={freeText}>
              <legend>Actor name</legend>
              <input className="text" type="text" value={(answers.actor as string) ?? ""} onChange={setText1("actor")} placeholder="e.g. Tom Hanks" />
            </fieldset>

            <fieldset className="q" disabled={freeText}>
              <legend>A movie you loved recently</legend>
              <input className="text" type="text" value={(answers.loved as string) ?? ""} onChange={setText1("loved")} placeholder="We'll find similar ones" />
            </fieldset>

            <fieldset className="q" disabled={freeText}>
              <legend>This or that? Tick one side per row</legend>
              <ThisOrThat picks={picks} onPick={pickSide} />
            </fieldset>
          </div>
        </div>
      </div>

      <div className="dock">
        <div className="submit-bar">
          <button className="primary" type="submit" disabled={!canSubmit}>
            Find my movie
          </button>
        </div>
        <nav className="menu" aria-label="Main menu">
          <button type="button" className="menu-btn" onClick={onOpenFavorites} aria-label={`Favorites (${favCount})`}>
            <Heart filled={favCount > 0} />
            {favCount > 0 && <span className="badge" aria-hidden="true">{favCount}</span>}
          </button>
        </nav>
      </div>
    </form>
  );
}
