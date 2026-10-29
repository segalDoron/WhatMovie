import type { WatchlistTab } from "./watchlist";

const TABS: { id: WatchlistTab; label: string }[] = [
  { id: "history", label: "History" },
  { id: "favorites", label: "Favorites" },
  { id: "watched", label: "Watched" },
];

interface Props {
  value: WatchlistTab;
  onChange: (tab: WatchlistTab) => void;
}

/** Tabs at the top of the watchlist (mobile sheet and desktop drawer). */
export default function WatchlistTabs({ value, onChange }: Props) {
  return (
    <div className="watch-tabs" role="group" aria-label="Watchlist">
      {TABS.map((t) => (
        <button key={t.id} type="button" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
