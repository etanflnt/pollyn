// Randomiser draws: entry building + weighted no-repeat selection with crypto.randomInt. Owner: Linus.
import { randomInt } from "node:crypto";
import type { Draw, DrawInput, Entry, EntrySource, GameKind, Poll, PollResponse, User } from "../types.ts";
import { newId } from "../ids.ts";
import { nowIso, parseJson, query, type Row } from "./db.ts";
import { badRequest } from "./errors.ts";
import { cleanLine } from "./polls.ts";

export const MAX_ENTRIES = 500;
export const MAX_WEIGHT = 100;
export const ENTRY_LABEL_MAX = 80;
const GAMES: GameKind[] = ["spinner", "raffle", "entries"];
const SOURCES: EntrySource[] = ["participants", "options", "custom"];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Build the frozen entry list for a draw (pure). */
export function buildEntries(poll: Poll, responses: PollResponse[], input: DrawInput): Entry[] {
  let entries: Entry[];
  if (input.source === "participants") {
    const done = responses
      .filter((r) => r.completed)
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? "") || a.id.localeCompare(b.id));
    const suggestions = new Map<string, number>();
    if (input.bonusForSuggestions) {
      for (const q of poll.questions) for (const o of q.options) {
        const uid = o.suggestedBy?.userId;
        if (uid) suggestions.set(uid, (suggestions.get(uid) ?? 0) + 1);
      }
    }
    entries = done.map((r, i) => ({
      label: poll.settings.anonymous ? `Voter #${i + 1}` : r.userName,
      weight: 1 + (input.bonusForSuggestions ? suggestions.get(r.userId) ?? 0 : 0),
    }));
  } else if (input.source === "options") {
    const q = poll.questions.find((x) => x.id === input.questionId);
    if (!q) throw badRequest("Pick a question to draw options from.");
    if (q.type !== "single" && q.type !== "multiple") throw badRequest("Only choice questions have options to draw from.");
    const votes = new Map<string, number>(q.options.map((o) => [o.id, 0]));
    for (const r of responses) {
      if (!r.completed) continue;
      for (const id of r.answers[q.id]?.optionIds ?? []) if (votes.has(id)) votes.set(id, votes.get(id)! + 1);
    }
    entries = q.options
      .filter((o) => o.label.trim())
      .map((o) => ({ label: o.label, weight: Math.max(1, votes.get(o.id) ?? 0) }));
  } else {
    if (!Array.isArray(input.entries)) throw badRequest("entries must be a list.");
    if (input.entries.length > MAX_ENTRIES) throw badRequest(`At most ${MAX_ENTRIES} entries.`);
    entries = [];
    for (const e of input.entries as unknown[]) {
      if (!isObj(e)) continue;
      const label = typeof e.label === "string" ? cleanLine(e.label, ENTRY_LABEL_MAX) : "";
      if (!label) continue;
      let w = Math.trunc(Number(e.weight ?? 1));
      if (!Number.isFinite(w)) w = 1;
      entries.push({ label, weight: Math.min(MAX_WEIGHT, Math.max(1, w)) });
    }
  }
  if (entries.length === 0) throw badRequest("There is nothing to draw from yet.");
  if (entries.length > MAX_ENTRIES) throw badRequest(`At most ${MAX_ENTRIES} entries.`);
  return entries;
}

export type RandomInt = (max: number) => number; // returns 0 <= n < max

/** Weighted draw without repeats; returns indexes into `entries` in draw order. */
export function pickWinners(entries: Entry[], count: number, rand: RandomInt = (max) => randomInt(max)): number[] {
  const pool = entries.map((e, i) => ({ i, w: Math.max(1, Math.trunc(e.weight) || 1) }));
  const n = Math.min(Math.max(1, Math.trunc(count) || 1), pool.length);
  const winners: number[] = [];
  for (let k = 0; k < n; k++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let ticket = rand(total);
    let idx = 0;
    while (ticket >= pool[idx].w) { ticket -= pool[idx].w; idx++; }
    winners.push(pool[idx].i);
    pool.splice(idx, 1);
  }
  return winners;
}

export function parseDrawInput(raw: unknown): DrawInput {
  if (!isObj(raw)) throw badRequest("Body must be a JSON object.");
  if (!GAMES.includes(raw.game as GameKind)) throw badRequest("game must be spinner, raffle or entries.");
  if (!SOURCES.includes(raw.source as EntrySource)) throw badRequest("source must be participants, options or custom.");
  const winners = Number(raw.winners ?? 1);
  if (!Number.isInteger(winners) || winners < 1 || winners > MAX_ENTRIES) throw badRequest("winners must be a whole number of at least 1.");
  return {
    game: raw.game as GameKind,
    source: raw.source as EntrySource,
    questionId: typeof raw.questionId === "string" ? raw.questionId : undefined,
    entries: Array.isArray(raw.entries) ? (raw.entries as Entry[]) : undefined,
    winners,
    bonusForSuggestions: raw.bonusForSuggestions === true,
  };
}


function rowToDraw(r: Row): Draw {
  return {
    id: String(r.id),
    pollId: String(r.poll_id),
    game: String(r.game) as GameKind,
    source: String(r.source) as EntrySource,
    entries: parseJson<Entry[]>(r.entries, []),
    winners: parseJson<number[]>(r.winners, []),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  };
}

export async function listDraws(pollId: string): Promise<Draw[]> {
  const rows = await query("SELECT * FROM draws WHERE poll_id = $1 ORDER BY seq DESC", [pollId]);
  return rows.map(rowToDraw);
}

export async function createDraw(poll: Poll, responses: PollResponse[], raw: unknown, user: User): Promise<Draw> {
  const input = parseDrawInput(raw);
  const entries = buildEntries(poll, responses, input);
  const draw: Draw = {
    id: newId("d_"),
    pollId: poll.id,
    game: input.game,
    source: input.source,
    entries,
    winners: pickWinners(entries, input.winners),
    createdBy: user.name,
    createdAt: nowIso(),
  };
  await query(
    "INSERT INTO draws (id, poll_id, game, source, entries, winners, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [draw.id, draw.pollId, draw.game, draw.source, JSON.stringify(draw.entries), JSON.stringify(draw.winners), draw.createdBy, draw.createdAt],
  );
  return draw;
}
