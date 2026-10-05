/** The animated film reel used by both the full-page loader and the small "show more" loader. */
export default function Reel({ size = 140 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
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
  );
}
