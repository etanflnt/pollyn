// Responses (resumable voting), suggestions and option removal. Owner: Linus.
import type { Answer, Option, Poll, PollResponse, User } from "../types.ts";
import { newId } from "../ids.ts";
import { nowIso, parseJson, query, queryOne, tx, type Row } from "./db.ts";
import { badRequest, notFound } from "./errors.ts";
import { LIMITS, cleanBlock, cleanLine, getPollRaw, savePoll } from "./polls.ts";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function rowToResponse(r: Row): PollResponse {
  return {
    id: String(r.id),
    pollId: String(r.poll_id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    answers: parseJson<Record<string, Answer>>(r.answers, {}),
    currentStep: Number(r.current_step ?? 0),
    completed: r.completed === true || r.completed === 1 || r.completed === "t",
    startedAt: String(r.started_at),
    updatedAt: String(r.updated_at),
    completedAt: r.completed_at == null ? null : String(r.completed_at),
  };
}

export async function getResponse(pollId: string, userId: string, opts: { forUpdate?: boolean } = {}): Promise<PollResponse | null> {
  const row = await queryOne(
    `SELECT * FROM responses WHERE poll_id = $1 AND user_id = $2${opts.forUpdate ? " FOR UPDATE" : ""}`,
    [pollId, userId],
  );
  return row ? rowToResponse(row) : null;
}

export async function listResponses(pollId: string, opts: { forUpdate?: boolean } = {}): Promise<PollResponse[]> {
  const rows = await query(
    `SELECT * FROM responses WHERE poll_id = $1 ORDER BY started_at ASC, id ASC${opts.forUpdate ? " FOR UPDATE" : ""}`,
    [pollId],
  );
  return rows.map(rowToResponse);
}

/** True when an answer carries something for its question type. */
export function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  return (a.optionIds?.length ?? 0) > 0 || typeof a.rating === "number" || (typeof a.text === "string" && a.text.length > 0);
}

/**
 * Validate answers against the poll's questions. Unknown question ids are dropped; empty answers
 * are dropped; invalid values throw 400. Pure.
 */
export function sanitizeAnswers(poll: Poll, raw: unknown): Record<string, Answer> {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) throw badRequest("answers must be an object keyed by question id.");
  const out: Record<string, Answer> = {};
  for (const q of poll.questions) {
    const a = raw[q.id];
    if (a === undefined || a === null) continue;
    if (!isObj(a)) throw badRequest(`Answer for "${q.title || q.id}" is invalid.`);
    const label = q.title || "a question";
    if (q.type === "single" || q.type === "multiple") {
      if (a.optionIds === undefined || a.optionIds === null) continue;
      if (!Array.isArray(a.optionIds) || a.optionIds.some((x) => typeof x !== "string")) {
        throw badRequest(`Answer for "${label}" must list option ids.`);
      }
      // Options the owner removed since the voter picked them are dropped silently (stale answers).
      const valid = new Set(q.options.map((o) => o.id));
      const ids = [...new Set(a.optionIds as string[])].filter((id) => valid.has(id));
      if (q.type === "single" && ids.length > 1) throw badRequest(`Pick only one option for "${label}".`);
      if (q.type === "multiple" && q.maxChoices && ids.length > q.maxChoices) {
        throw badRequest(`Pick at most ${q.maxChoices} options for "${label}".`);
      }
      if (ids.length) out[q.id] = { optionIds: ids };
    } else if (q.type === "rating") {
      if (a.rating === undefined || a.rating === null) continue;
      const n = a.rating;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) throw badRequest(`Rating for "${label}" must be 1 to 5.`);
      out[q.id] = { rating: n };
    } else {
      if (a.text === undefined || a.text === null) continue;
      if (typeof a.text !== "string") throw badRequest(`Answer for "${label}" must be text.`);
      const t = cleanBlock(a.text, LIMITS.text);
      if (t) out[q.id] = { text: t };
    }
  }
  return out;
}

export function missingRequired(poll: Poll, answers: Record<string, Answer>): string[] {
  return poll.questions.filter((q) => q.required && !isAnswered(answers[q.id])).map((q) => q.id);
}

/** Pure merge of an input into an existing response (or a new one). */
export function applyResponseInput(poll: Poll, user: User, existing: PollResponse | null, raw: unknown, now = nowIso()): PollResponse {
  if (!isObj(raw)) throw badRequest("Body must be a JSON object.");
  const answers = sanitizeAnswers(poll, raw.answers);
  const maxStep = poll.questions.length + 1;
  let step = Number(raw.currentStep ?? existing?.currentStep ?? 0);
  if (!Number.isFinite(step)) step = 0;
  step = Math.min(maxStep, Math.max(0, Math.trunc(step)));
  // Once submitted a response stays submitted; it may still be edited until the poll closes.
  const completed = !!existing?.completed || raw.completed === true;
  if (completed) {
    const missing = missingRequired(poll, answers);
    if (missing.length) {
      const q = poll.questions.find((x) => x.id === missing[0]);
      throw badRequest(`Please answer "${q?.title || "the required question"}" before submitting.`);
    }
  }
  return {
    id: existing?.id ?? newId("r_"),
    pollId: poll.id,
    userId: user.id,
    userName: user.name,
    answers,
    currentStep: step,
    completed,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    completedAt: completed ? existing?.completedAt ?? now : null,
  };
}

export async function upsertResponse(poll: Poll, user: User, raw: unknown): Promise<PollResponse> {
  return tx(async () => {
    const existing = await getResponse(poll.id, user.id, { forUpdate: true });
    const r = applyResponseInput(poll, user, existing, raw);
    // Two first-time saves can race past the (empty) row lock: the upsert keeps completion sticky anyway.
    const row = await queryOne(
      `INSERT INTO responses (id, poll_id, user_id, user_name, answers, current_step, completed, started_at, updated_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (poll_id, user_id) DO UPDATE SET user_name = excluded.user_name, answers = excluded.answers,
         current_step = excluded.current_step, completed = responses.completed OR excluded.completed,
         updated_at = excluded.updated_at, completed_at = COALESCE(responses.completed_at, excluded.completed_at)
       RETURNING *`,
      [r.id, r.pollId, r.userId, r.userName, JSON.stringify(r.answers), r.currentStep, r.completed,
        r.startedAt, r.updatedAt, r.completedAt],
    );
    return row ? rowToResponse(row) : r;
  });
}

/* ---------------- suggestions ---------------- */

export function normalizeLabel(s: string): string {
  return s.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pure: add a voter suggestion to a question. Returns the (possibly unchanged) poll and the option.
 * Duplicate labels (case-insensitive) return the existing option.
 */
export function applySuggestion(poll: Poll, questionId: string, rawLabel: unknown, user: User): { poll: Poll; option: Option; added: boolean } {
  const qi = poll.questions.findIndex((q) => q.id === questionId);
  if (qi < 0) throw notFound("Question not found.");
  const q = poll.questions[qi];
  if ((q.type !== "single" && q.type !== "multiple") || !q.allowSuggestions) {
    throw badRequest("This question does not accept suggestions.");
  }
  if (typeof rawLabel !== "string") throw badRequest("label is required.");
  const label = cleanLine(rawLabel, 1000);
  if (!label) throw badRequest("Suggestion cannot be empty.");
  if (label.length > LIMITS.suggestion) throw badRequest(`Keep suggestions to ${LIMITS.suggestion} characters.`);
  const key = normalizeLabel(label);
  const dup = q.options.find((o) => normalizeLabel(o.label) === key);
  if (dup) return { poll, option: dup, added: false };
  if (q.options.length >= LIMITS.options) throw badRequest("This question already has the maximum number of options.");
  const option: Option = { id: newId("o_"), label, media: null, suggestedBy: { userId: user.id, name: user.name } };
  const questions = poll.questions.slice();
  questions[qi] = { ...q, options: [...q.options, option] };
  return { poll: { ...poll, questions }, option, added: true };
}

export async function addSuggestion(pollId: string, questionId: string, rawLabel: unknown, user: User): Promise<Option> {
  return tx(async () => {
    // Re-read with a row lock so concurrent suggestions / builder saves are not lost.
    const fresh = await getPollRaw(pollId, { forUpdate: true });
    if (!fresh) throw notFound("Poll not found.");
    const r = applySuggestion(fresh, questionId, rawLabel, user);
    if (r.added) await savePoll(r.poll);
    return r.option;
  });
}

/* ---------------- option removal ---------------- */

export async function deleteOption(poll: Poll, questionId: string, optionId: string): Promise<void> {
  await tx(async () => {
    const fresh = await getPollRaw(poll.id, { forUpdate: true });
    if (!fresh) throw notFound("Poll not found.");
    const qi = fresh.questions.findIndex((q) => q.id === questionId);
    if (qi < 0) throw notFound("Question not found.");
    const q = fresh.questions[qi];
    if (!q.options.some((o) => o.id === optionId)) throw notFound("Option not found.");
    const questions = fresh.questions.slice();
    questions[qi] = { ...q, options: q.options.filter((o) => o.id !== optionId) };
    await savePoll({ ...fresh, questions });

    for (const r of await listResponses(poll.id, { forUpdate: true })) {
      const a = r.answers[questionId];
      if (!a?.optionIds?.includes(optionId)) continue;
      const ids = a.optionIds.filter((id) => id !== optionId);
      const answers = { ...r.answers };
      if (ids.length) answers[questionId] = { ...a, optionIds: ids };
      else delete answers[questionId];
      await query("UPDATE responses SET answers = $1 WHERE id = $2", [JSON.stringify(answers), r.id]);
    }
  });
}
