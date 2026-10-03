import { useEffect, useState } from "react";

const LINES = ["Popping the corn", "Rolling the reel", "Dimming the lights", "Picking your movie"];

export default function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LINES.length), 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="loading" role="status" aria-live="polite">
      <svg viewBox="0 0 120 120" width="140" height="140" aria-hidden="true">
        <g className="reel">
          <circle cx="60" cy="60" r="52" fill="var(--primary)" />
          <circle cx="60" cy="60" r="10" fill="var(--bg)" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <circle key={a} cx="60" cy="26" r="11" fill="var(--bg)" transform={`rotate(${a} 60 60)`} />
          ))}
        </g>
        <g className="kernel">
          <circle cx="94" cy="20" r="7" fill="var(--sun)" />
        </g>
      </svg>
      <p>{LINES[i]}…</p>
    </div>
  );
}
