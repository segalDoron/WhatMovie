import type { SavedSearch } from "./userData";
import { describeSearch } from "./describeSearch";
import { Clock, Close } from "./Icons";
import { useAnimatedList } from "./useAnimatedList";
import "./list-motion.css";

interface Props {
  items: SavedSearch[];
  onClose: () => void;
  onPick: (s: SavedSearch) => void;
  onRemove: (id: string) => void;
}

/** Header, scrollable list of the last searches. Shown in the mobile sheet and the desktop drawer. */
export default function HistoryContent({ items, onClose, onPick, onRemove }: Props) {
  const rows = useAnimatedList(items, (s) => s.id);
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
            <p>No searches yet. Your last 10 searches will show up here.</p>
          </div>
        ) : (
          <ul className="list">
            {rows.map(({ key, item: s, anim }) => {
              const d = describeSearch(s.answers);
              const leaving: Record<string, string> = anim === "leave" ? { inert: "", "aria-hidden": "true" } : {};
              return (
                <li key={key} className={`has-remove${anim ? ` row-anim row-${anim}` : ""}`} {...leaving}>
                  <div className="row-clip">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
