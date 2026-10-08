import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Close, SelectIcon, Trash } from "./Icons";
import { users } from "./users";
import { useUsers } from "./useUsers";

type View = "name" | "new" | "change";

/** Add a new user. Cancel goes back to the name step (only when there is a user to go back to). */
function NewUserForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
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
        className="text pm-input"
        type="text"
        value={name}
        maxLength={30}
        autoComplete="off"
        placeholder="What is your name"
        aria-label="What is your name"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="pm-footer">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="primary" type="submit" disabled={!name.trim()}>
          Add me
        </button>
      </div>
    </form>
  );
}

/** Pick a user. Clicking a row only selects it; "Select" makes it the active user. The trash icon removes a user. */
function UserList({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const list = useUsers();
  const [selected, setSelected] = useState<number | null>(() => users.getActive()?.id ?? null);

  const remove = (id: number) => {
    users.remove(id);
    // If the selected user was removed, fall back to whoever is active now.
    setSelected((prev) => (prev === id ? users.getActive()?.id ?? null : prev));
  };

  const select = () => {
    if (selected !== null) users.setActive(selected);
    onDone();
  };

  return (
    <div className="pm-body">
      <ul className="pm-list">
        {list.map((u) => {
          const isSelected = selected === u.id;
          return (
            <li key={u.id} className="pm-row">
              <button
                type="button"
                className="pm-user"
                aria-pressed={isSelected}
                aria-label={`Choose ${u.name}`}
                onClick={() => setSelected(u.id)}
              >
                <span className="pm-user-name">{u.name}</span>
                <SelectIcon filled={isSelected} />
              </button>
              <button
                type="button"
                className="pm-trash"
                aria-label={`Remove ${u.name}`}
                onClick={() => remove(u.id)}
              >
                <Trash />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="pm-footer">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={select} disabled={selected === null}>
          Select
        </button>
      </div>
    </div>
  );
}

function Body({ onDone }: { onDone: () => void }) {
  const list = useUsers();
  const [view, setView] = useState<View>(() => (users.getAll().length ? "name" : "new"));
  const addNew = useRef<HTMLButtonElement>(null);
  const active = list.find((u) => u.isActive) ?? list[0];

  useEffect(() => {
    if (view === "name") addNew.current?.focus();
  }, [view]);

  if (view === "new" || !active) {
    return <NewUserForm onDone={onDone} onCancel={list.length ? () => setView("name") : undefined} />;
  }
  if (view === "change") return <UserList onDone={onDone} onCancel={() => setView("name")} />;
  return (
    <div className="pm-body">
      <p className="pm-name">{active.name}</p>
      <div className="pm-footer">
        <button className="secondary" onClick={() => setView("change")}>
          Change user
        </button>
        <button ref={addNew} className="primary" onClick={() => setView("new")}>
          Add new
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
  // Every opening gets a fresh body (so the right step shows), while the old one stays visible during the fade-out.
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