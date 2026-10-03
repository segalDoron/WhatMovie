import { useState } from "react";
import { CORE, MORE, type Question } from "./options";
import type { Answers } from "./types";

const MAX = 80;

interface Props {
  onSubmit: (p: { mode: "text"; input: string } | { mode: "answers"; answers: Answers }) => void;
}

export default function QuestionForm({ onSubmit }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [showMore, setShowMore] = useState(false);
  const [freeText, setFreeText] = useState(false);
  const [text, setText] = useState("");

  const pick = (q: Question, v: string) =>
    setAnswers((a) => {
      if (!q.multi) return { ...a, [q.key]: a[q.key] === v ? "" : v };
      const cur = (a[q.key] as string[]) ?? [];
      return { ...a, [q.key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const isOn = (q: Question, v: string) =>
    q.multi ? ((answers[q.key] as string[]) ?? []).includes(v) : answers[q.key] === v;

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

  const canSubmit = freeText ? text.trim().length > 0 : true;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(freeText ? { mode: "text", input: text.trim() } : { mode: "answers", answers });
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
              <legend>A movie you loved recently</legend>
              <input
                className="text"
                type="text"
                value={(answers.loved as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, loved: e.target.value }))}
                placeholder="We'll find similar ones"
              />
            </fieldset>
          </div>
        </div>
      </div>

      <button className="primary" type="submit" disabled={!canSubmit}>
        Find my movie
      </button>
    </form>
  );
}
