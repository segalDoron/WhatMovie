import FavoritesContent, { type FavoritesContentProps } from "./FavoritesContent";

interface Props extends Omit<FavoritesContentProps, "closeRef"> {
  open: boolean;
}

/** Larger screens: right-side drawer, full height. It stays open until its close button (or the heart) is used. */
export default function FavoritesDrawer({ open, ...content }: Props) {
  return (
    <aside className={`drawer ${open ? "open" : ""}`} aria-label="Favorites" aria-hidden={!open}>
      <div className="drawer-inner">
        <FavoritesContent {...content} />
      </div>
    </aside>
  );
}
