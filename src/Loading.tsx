import { useEffect, useState } from "react";
import Reel from "./Reel";

const LINES = ["Popping the corn", "Rolling the reel", "Dimming the lights", "Picking your movie"];

export default function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="loading" role="status" aria-live="polite">
      <Reel />
      <p>{LINES[i]}…</p>
    </div>
  );
}
