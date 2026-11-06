"use client";
// Randomiser arcade helpers: entry parsing, odds, palette, sound, reduced motion. Owner: Woz.
import { useEffect, useState } from "react";
import type { Draw, Entry, EntrySource, GameKind } from "@/lib/types";

export const MAX_ENTRIES = 500;
export const MAX_WINNERS = 10;
export const MAX_WEIGHT = 100;

/** One reveal step: animate until entries[winner] is shown. `key` changes per reveal. */
export interface GameRun { key: number; winner: number }

/** Props every game stage receives from the arcade. */
export interface GameStageProps {
  entries: Entry[];
  /** Participants preview: names are not known until the draw. */
  placeholder: boolean;
  run: GameRun | null;
  /** Winner just revealed (highlight), or null while idle/spinning. */
  current: number | null;
  /** Earlier winners in this draw (dimmed / marked). */
  previous: number[];
  /** Ordered list of all winners revealed so far. */
  revealed: number[];
  reduced: boolean;
  onTick: () => void;
  onLanded: () => void;
  onPlay: () => void;
  canPlay: boolean;
  playLabel: string;
}

export const GAME_META: Record<GameKind, { label: string; short: string; verb: string; next: string }> = {
  spinner: { label: "Spinner wheel", short: "Spinner", verb: "Spin the wheel", next: "Next spin" },
  raffle: { label: "Raffle draw", short: "Raffle", verb: "Draw a ticket", next: "Draw next ticket" },
  entries: { label: "Entry count", short: "Entry count", verb: "Draw a winner", next: "Draw next winner" },
};

export const SOURCE_LABEL: Record<EntrySource, string> = {
  participants: "Voters",
  options: "Poll options",
  custom: "Custom list",
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** One entry per line. `Name x3` (or `Name × 3`) gives that entry 3 tickets (1..100). */
export function parseCustomList(text: string): { entries: Entry[]; truncated: boolean } {
  const entries: Entry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)\s+[x×]\s*(\d{1,6})$/i.exec(line);
    const label = (m ? m[1]!.trim() : line).slice(0, 80);
    const weight = m ? clamp(parseInt(m[2]!, 10) || 1, 1, MAX_WEIGHT) : 1;
    entries.push({ label, weight });
  }
  return { entries: entries.slice(0, MAX_ENTRIES), truncated: entries.length > MAX_ENTRIES };
}

export const totalTickets = (entries: Entry[]) => entries.reduce((a, e) => a + Math.max(1, e.weight), 0);

export function oddsPct(weight: number, total: number): string {
  if (!total) return "0%";
  const p = (weight / total) * 100;
  return p >= 10 ? `${Math.round(p)}%` : p >= 1 ? `${p.toFixed(1)}%` : `${p.toFixed(2)}%`;
}

/** First ticket number of each entry (1-based), so ticket ranges are stable for a list. */
export function ticketStarts(entries: Entry[]): number[] {
  let acc = 1;
  return entries.map((e) => { const s = acc; acc += Math.max(1, e.weight); return s; });
}

export const pad4 = (n: number) => String(n).padStart(4, "0");

/** Visual-only weighted pick (filler for reels). The real winner always comes from the server. */
export function visualPick(entries: Entry[], total = totalTickets(entries)): number {
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) { r -= Math.max(1, entries[i]!.weight); if (r < 0) return i; }
  return entries.length - 1;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

export function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = (Date.now() - t) / 1000;
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Plain-text summary for clipboard / Teams chat. */
export function drawSummary(draw: Draw, pollTitle?: string, upTo = draw.winners.length): string {
  const when = new Date(draw.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const tickets = totalTickets(draw.entries);
  const lines = [
    `${GAME_META[draw.game].label}${pollTitle ? ` · ${pollTitle}` : ""} · ${when}`,
    `${draw.winners.length > 1 ? "Winners" : "Winner"}:`,
    ...draw.winners.slice(0, upTo).map((w, i) => `${i + 1}. ${draw.entries[w]?.label ?? "?"}`),
    `From ${draw.entries.length} ${draw.entries.length === 1 ? "entry" : "entries"} (${tickets} tickets, source: ${SOURCE_LABEL[draw.source]}). Drawn on the server with a cryptographically secure weighted draw.`,
  ];
  return lines.join("\n");
}

/* ---------- Wheel palette (FLNT brand hexes) ---------- */
export const WHEEL_COLORS: { fill: string; ink: string }[] = [
  { fill: "#0B7A6E", ink: "#FFFFFF" }, // teal deep
  { fill: "#8CE3C6", ink: "#171A42" }, // mint
  { fill: "#4F5FD6", ink: "#FFFFFF" }, // blue
  { fill: "#E9B35A", ink: "#171A42" }, // amber
  { fill: "#171A42", ink: "#8CE3C6" }, // navy
  { fill: "#4C9A96", ink: "#171A42" }, // teal
  { fill: "#8FA0FF", ink: "#171A42" }, // blue tint
];
export function segmentColor(i: number, n: number) {
  const k = WHEEL_COLORS.length;
  let idx = i % k;
  // avoid the last segment matching the first one when the wheel wraps around
  if (n > 1 && i === n - 1 && idx === 0) idx = 2;
  return WHEEL_COLORS[idx]!;
}

/* ---------- Reduced motion ---------- */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setReduced(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return reduced;
}

/* ---------- Tiny WebAudio sfx (no assets) ---------- */
export interface Sfx { unlock: () => void; tick: () => void; win: () => void }
export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let lastTick = 0;
  const ensure = () => {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };
  const blip = (freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  return {
    unlock: () => { ensure(); },
    tick: () => {
      const now = performance.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      blip(1700, 0.03, "square", 0.035);
    },
    win: () => {
      blip(660, 0.14, "triangle", 0.12, 0);
      blip(880, 0.14, "triangle", 0.12, 0.12);
      blip(1320, 0.32, "triangle", 0.14, 0.24);
    },
  };
}

/** Reads the current rotation (deg) or translateY (px) from an element mid-transition. */
export function readMatrix(el: Element): { angle: number; y: number } {
  const tr = getComputedStyle(el).transform;
  if (!tr || tr === "none") return { angle: 0, y: 0 };
  const nums = tr.slice(tr.indexOf("(") + 1, -1).split(",").map((v) => parseFloat(v));
  const [a = 1, b = 0] = nums;
  const y = tr.startsWith("matrix3d") ? nums[13] ?? 0 : nums[5] ?? 0;
  return { angle: (Math.atan2(b, a) * 180) / Math.PI, y };
}
