import type { SavedSearch } from "./searchHistory";
import { describeSearch } from "./describeSearch";
import { Clock, Close } from "./Icons";

interface Props {
  items: SavedSearch[];
  onClose: () => void;
  onPick: (s: SavedSearch) => void;
  onRemove: (id: string) => void;
}

/** Header, scrollable list of the last searches. Shown in the mobile sheet and the desktop drawer. */
export default function HistoryContent({ items, onClose, onPick, onRemove }: Props) {
  return (
    <>
      <header className="sheet-head">
        <h2>Recent searches</h2>
        <button className="x" onClick={onClose} aria-label="Close recent searches">
          <Close />
        </button>
      </header>

      <div className="sheet-body">
        {items.length === 0 ? (
          <div className="empty-state">
            <Clock size={56} />
            <p>No searches yet. Your last 5 searches will show up here.</p>
          </div>
        ) : (
          <ul className="list">
            {items.map((s) => {
              const d = describeSearch(s.answers);
              return (
                <li key={s.id} className="has-remove">
                  <button className="item search-card" onClick={() => onPick(s)}>
                    <span className="search-icon"><Clock /></span>
                    <div className="meta">
                      <h2>{d.title}</h2>
                      <p className="search-desc">{d.details}</p>
                    </div>
                  </button>
                  <button className="remove dismiss" onClick={() => onRemove(s.id)} aria-label={`Remove search: ${d.title}`}>
                    <Close />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
