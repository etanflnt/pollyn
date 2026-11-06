// Small stroke icons for the arcade. Owner: Woz.
import type { GameKind } from "@/lib/types";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function GameIcon({ kind, size = 18 }: { kind: GameKind; size?: number }) {
  if (kind === "spinner") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
        <circle cx="12" cy="13" r="8.5" />
        <path d="M12 13V4.5M12 13l7.4 4.2M12 13l-7.4 4.2" />
        <path d="M10 1.8h4L12 4.6z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "raffle") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4z" />
        <path d="M15 6.5v2M15 11v2M15 15.5v2" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M4 6h9M4 12h14M4 18h6" strokeWidth="3" />
    </svg>
  );
}

export function SoundIcon({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

export function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </svg>
  );
}

export function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </svg>
  );
}
