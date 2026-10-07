import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Close, SelectIcon } from "./Icons";
import { users } from "./users";
import { useUsers } from "./useUsers";

type View = "new" | "profile" | "change";

/** Add a new user: the new user becomes the active one. */
function NewUserForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    users.add(name);
    onDone();
  };

  return (
    <form className="pm-body" onSubmit={submit}>
      <input
        ref={input}
        className="text"
        type="text"
        value={name}
        maxLength={30}
        autoComplete="off"
        placeholder="What is your name"
        aria-label="What is your name"
        onChange={(e) => setName(e.target.value)}
      />
      <button className="primary" type="submit" disabled={!name.trim()}>
        Add me
      </button>
    </form>
  );
}

/** Pick which user is active. */
function UserList({ onDone }: { onDone: () => void }) {
  const list = useUsers();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <div className="pm-body">
      <ul className="pm-list">
        {list.map((u, i) => (
          <li key={u.id}>
            <button
              ref={i === 0 ? first : undefined}
              className="pm-user"
              aria-pressed={u.isActive}
              aria-label={`Select ${u.name}`}
              onClick={() => {
                users.setActive(u.id);
                onDone();
              }}
            >
              <span className="pm-user-name">{u.name}</span>
              <SelectIcon filled={u.isActive} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ onDone }: { onDone: () => void }) {
  const list = useUsers();
  const [view, setView] = useState<View>(() => (users.getAll().length ? "profile" : "new"));
  const addNew = useRef<HTMLButtonElement>(null);
  const active = list.find((u) => u.isActive) ?? list[0];

  useEffect(() => {
    if (view === "profile") addNew.current?.focus();
  }, [view]);

  if (view === "new" || !active) return <NewUserForm onDone={onDone} />;
  if (view === "change") return <UserList onDone={onDone} />;
  return (
    <div className="pm-body">
      <p className="pm-name">{active.name}</p>
      <div className="pm-actions">
        <button ref={addNew} className="primary" onClick={() => setView("new")}>
          Add new
        </button>
        <button className="secondary" onClick={() => setView("change")}>
          Change user
        </button>
      </div>
    </div>
  );
}

interface Props { open: boolean; onClose: () => void }

/**
 * "Who am I?" modal. Closes only with the X button (or Escape), never by clicking outside.
 * It stays mounted so it can fade and scale in and out.
 */
export default function ProfileModal({ open, onClose }: Props) {
  // Every opening gets a fresh body (so the right view shows), while the old one stays visible during the fade-out.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.(); // back to the button that opened the modal
    };
  }, [open]);

  return createPortal(
    <div className={`pm-backdrop ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="pm" role="dialog" aria-modal="true" aria-labelledby="pm-title">
        <header className="pm-head">
          <h2 id="pm-title">Who am I?</h2>
          <button className="x" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>
        <Body key={session} onDone={onClose} />
      </div>
    </div>,
    document.body
  );
}
