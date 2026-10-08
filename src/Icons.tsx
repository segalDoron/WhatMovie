export const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const Star = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
  </svg>
);

const base = { width: 22, height: 22, viewBox: "0 0 24 24", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const ThumbUp = ({ filled }: { filled: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} stroke="currentColor">
    <path d="M7 10v11H3V10h4Zm0 0 4-8a2.5 2.5 0 0 1 2.5 2.7L13 9h6.3a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H7" />
  </svg>
);
export const ThumbDown = ({ filled }: { filled: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} stroke="currentColor">
    <path d="M17 14V3h4v11h-4Zm0 0-4 8a2.5 2.5 0 0 1-2.5-2.7L11 15H4.7a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.1 4H17" />
  </svg>
);
export const Heart = ({ filled }: { filled: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} stroke="currentColor">
    <path d="M12 21s-8-4.9-9.3-10A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11C20 16.1 12 21 12 21Z" />
  </svg>
);
export const Close = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const Play = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);
export const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const Clock = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const User = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const SelectIcon = ({ filled }: { filled: boolean }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" strokeWidth="2" stroke={filled ? "var(--accent)" : "currentColor"} fill={filled ? "var(--accent)" : "none"} opacity={filled ? 1 : 0.45} />
    {filled && <path d="m7.5 12.5 3 3 6-6.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
);
export const Trash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);