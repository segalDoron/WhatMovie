import { useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Movie } from "./types";
import { Chevron, Sort } from "./Icons";
import MovieRow from "./MovieRow";
import Reel from "./Reel";
import { useUserData } from "./userData";
import "./sort-dock.css";

/** The nearest ancestor that scrolls vertically (or the window). */
function scrollerOf(el: HTMLElement | null): HTMLElement | Window {
  let p = el?.parentElement ?? null;
  while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
  return p ?? window;
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  movies: Movie[];
  onOpen: (m: Movie) => void;
  onStartOver: () => void;
  tabbable: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  moreMessage: string;
  onMore: () => void;
  sorted: boolean;
  onToggleSort: () => void;
}

export default function ResultsList({ movies, onOpen, onStartOver, tabbable, hasMore, loadingMore, moreMessage, onMore, sorted, onToggleSort }: Props) {
  const t = tabbable ? 0 : -1;
  const { isFavorite } = useUserData();

  // The sort button sits under the list and, once scrolled up to the header, docks into the header
  // beside "Start over". One element is moved, so keyboard focus and state are kept; the move is animated.
  const barRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  const fromRect = useRef<DOMRect | null>(null);
  const hadFocus = useRef(false);

  useEffect(() => {
    const scroller = scrollerOf(toolsRef.current);
    const check = () => {
      const tools = toolsRef.current;
      const bar = barRef.current;
      if (!tools || !bar) return;
      const next = tools.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom + 1;
      setDocked((prev) => {
        if (prev === next) return prev;
        fromRect.current = sortRef.current?.getBoundingClientRect() ?? null;
        hadFocus.current = document.activeElement === sortRef.current;
        return next;
      });
    };
    check();
    scroller.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      scroller.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [movies.length]);

  useLayoutEffect(() => {
    const el = sortRef.current;
    if (hadFocus.current && el) el.focus({ preventScroll: true });
    const from = fromRect.current;
    fromRect.current = null;
    if (!el || !from || reduceMotion()) return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (dx || dy) {
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(.2, .8, .2, 1)" }
      );
    }
  }, [docked]);

  const sortButton = (
    <button
      ref={sortRef}
      className={`sort${docked ? " docked" : ""}`}
      aria-pressed={sorted}
      onClick={onToggleSort}
      tabIndex={t}
    >
      <Sort /> Sort by rating
    </button>
  );

  return (
    <>
      <header className="bar" ref={barRef}>
        <button className="back" onClick={onStartOver} tabIndex={t}>
          <Chevron /> Start over
        </button>
        <div className="sort-slot" ref={slotRef}>
          {docked && movies.length > 1 && slotRef.current && createPortal(sortButton, slotRef.current)}
        </div>
      </header>
      {movies.length > 1 && (
        <div className="list-tools" ref={toolsRef}>
          {!docked && sortButton}
        </div>
      )}
      {movies.length === 0 ? (
        <p className="empty">No matches. Try loosening a filter or start over.</p>
      ) : (
        <ul className="list">
          {movies.map((m) => (
            <MovieRow key={m.id} movie={m} onOpen={() => onOpen(m)} favorite={isFavorite(m.id)} tabIndex={t} />
          ))}
        </ul>
      )}

      <div className="more-row" aria-live="polite">
        {loadingMore ? (
          <div className="more-loading" role="status" aria-label="Loading more movies">
            <Reel size={56} />
          </div>
        ) : (
          hasMore && (
            <button className="link more-link" onClick={onMore} tabIndex={t}>
              Show more
            </button>
          )
        )}
        {moreMessage && <p className="more-msg">{moreMessage}</p>}
      </div>
    </>
  );
}
