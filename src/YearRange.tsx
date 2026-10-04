export const MIN_YEAR = 1970;
export const MAX_YEAR = new Date().getFullYear();

const DECADES: [string, number, number][] = [
  ["70s", 1970, 1979], ["80s", 1980, 1989], ["90s", 1990, 1999],
  ["00s", 2000, 2009], ["10s", 2010, 2019], ["20s", 2020, MAX_YEAR],
];

interface Props { value: [number, number]; onChange: (v: [number, number]) => void }

export default function YearRange({ value: [from, to], onChange }: Props) {
  const span = MAX_YEAR - MIN_YEAR;
  const left = ((from - MIN_YEAR) / span) * 100;
  const right = 100 - ((to - MIN_YEAR) / span) * 100;

  return (
    <div className="years">
      <p className="years-label">{from} – {to}</p>
      <div className="range">
        <div className="rail" />
        <div className="fill" style={{ left: `${left}%`, right: `${right}%` }} />
        <input
          type="range" min={MIN_YEAR} max={MAX_YEAR} value={from} aria-label="From year"
          style={{ zIndex: from > (MIN_YEAR + MAX_YEAR) / 2 ? 5 : 3 }}
          onChange={(e) => onChange([Math.min(Number(e.target.value), to), to])}
        />
        <input
          type="range" min={MIN_YEAR} max={MAX_YEAR} value={to} aria-label="To year"
          style={{ zIndex: 4 }}
          onChange={(e) => onChange([from, Math.max(Number(e.target.value), from)])}
        />
      </div>
      <div className="chips">
        {DECADES.map(([label, a, b]) => (
          <button key={label} type="button" className="chip" aria-pressed={from === a && to === b} onClick={() => onChange([a, b])}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
