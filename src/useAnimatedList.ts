import { useEffect, useState } from "react";

export type RowAnim = "enter" | "leave" | null;
export interface Row<T> { key: string; item: T; anim: RowAnim }

const MOTION_MS = 300; // keep in sync with list-motion.css
const MAX_ANIMATED = 3; // bigger changes (a full reload of the list) are not animated

interface State<T> {
  sig: string;
  items: T[];
  entering: string[];
  leaving: { key: string; item: T; index: number }[];
}

/**
 * Wraps a list so rows added after the first render get anim "enter", and rows that were removed stay
 * in place with anim "leave" until their collapse animation is done.
 */
export function useAnimatedList<T>(items: T[], getKey: (item: T) => string | number): Row<T>[] {
  const key = (i: T) => String(getKey(i));
  const sig = items.map(key).join("|");
  const [s, setS] = useState<State<T>>({ sig, items, entering: [], leaving: [] });

  if (s.sig !== sig) {
    const prevKeys = new Set(s.items.map(key));
    const nextKeys = new Set(items.map(key));
    const added = items.map(key).filter((k) => !prevKeys.has(k));
    const removed = s.items.map((item, index) => ({ key: key(item), item, index })).filter((r) => !nextKeys.has(r.key));
    const animate = added.length + removed.length <= MAX_ANIMATED;
    setS({
      sig,
      items,
      entering: animate ? [...s.entering.filter((k) => nextKeys.has(k)), ...added] : [],
      leaving: animate ? [...s.leaving.filter((l) => !nextKeys.has(l.key)), ...removed] : [],
    });
  }

  useEffect(() => {
    if (!s.entering.length && !s.leaving.length) return;
    const t = window.setTimeout(() => setS((cur) => ({ ...cur, entering: [], leaving: [] })), MOTION_MS + 60);
    return () => window.clearTimeout(t);
  }, [s.entering, s.leaving]);

  const entering = new Set(s.entering);
  const rows: Row<T>[] = items.map((item) => ({ key: key(item), item, anim: entering.has(key(item)) ? "enter" : null }));
  [...s.leaving]
    .sort((a, b) => a.index - b.index)
    .forEach((l) => rows.splice(Math.min(l.index, rows.length), 0, { key: l.key, item: l.item, anim: "leave" }));
  return rows;
}
