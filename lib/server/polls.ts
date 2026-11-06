// Poll validation, access rules and persistence. Owner: Linus.
import type {
  Media, Option, Poll, PollInput, PollResponse, PollSettings, PollStatus, PollSummary, PollView, Question,
  QuestionType, User,
} from "../types.ts";
import { newId, newSlug } from "../ids.ts";
import { nowIso, parseJson, query, queryOne, tx, type Row } from "./db.ts";
import { badRequest, closed, forbidden, notFound, unauthenticated, wrongTenant } from "./errors.ts";

export const LIMITS = {
  title: 200,
  description: 2000,
  questions: 50,
  options: 30,
  questionTitle: 300,
  questionDescription: 1000,
  optionLabel: 120,
  suggestion: 60,
  url: 2048,
  alt: 200,
  text: 2000,
} as const;

export const DEFAULT_SETTINGS: PollSettings = {
  access: "org",
  resultsVisibility: "after_vote",
  showVoteCounts: true,
  showVoterNames: false,
  anonymous: false,
  closesAt: null,
  theme: "teal",
};

const QUESTION_TYPES: QuestionType[] = ["single", "multiple", "rating", "text"];
const STATUSES: PollStatus[] = ["draft", "open", "closed"];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UPLOAD_URL_RE = /^\/api\/uploads\/[a-f0-9]{32}\.(png|jpg|gif|webp)$/;
// eslint-disable-next-line no-control-regex
const CTRL_SINGLE = /[\u0000-\u001f\u007f]/g;
// eslint-disable-next-line no-control-regex
const CTRL_MULTI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/* ---------------- sanitising ---------------- */

/** Single-line text: control chars removed, whitespace collapsed, trimmed, capped. */
export function cleanLine(raw: unknown, max: number): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw badRequest("Expected text.");
  return raw.replace(CTRL_SINGLE, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Multi-line text: keeps newlines/tabs, trimmed, capped. */
export function cleanBlock(raw: unknown, max: number): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw badRequest("Expected text.");
  return raw.replace(/\r\n?/g, "\n").replace(CTRL_MULTI, "").trim().slice(0, max);
}

function isHttpUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

export function sanitizeMedia(raw: unknown, allowVideo: boolean, where: string): Media | null {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) throw badRequest(`${where}: media must be an object.`);
  const kind = raw.kind;
  if (kind !== "image" && kind !== "video") throw badRequest(`${where}: media kind must be image or video.`);
  if (kind === "video" && !allowVideo) throw badRequest(`${where}: only images are allowed here.`);
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url || url.length > LIMITS.url) throw badRequest(`${where}: media url is missing or too long.`);
  const okUrl = kind === "image" ? isHttpUrl(url) || UPLOAD_URL_RE.test(url) : isHttpUrl(url);
  if (!okUrl) throw badRequest(`${where}: media url must be http(s)${kind === "image" ? " or an uploaded image" : ""}.`);
  const media: Media = { kind, url };
  const alt = cleanLine(raw.alt, LIMITS.alt);
  if (alt) media.alt = alt;
  return media;
}

type SuggestedBy = NonNullable<Option["suggestedBy"]>;

/**
 * Validate a full questions array. `existing` (the stored questions) is used to keep the
 * server-owned `suggestedBy` field: clients cannot invent or alter it, and voter-suggested
 * options missing from a (possibly stale) builder payload are kept (owner removes them via
 * DELETE .../options/:oid).
 */
export function sanitizeQuestions(raw: unknown, existing: Question[] = []): Question[] {
  if (!Array.isArray(raw)) throw badRequest("questions must be an array.");
  if (raw.length > LIMITS.questions) throw badRequest(`A poll can have at most ${LIMITS.questions} questions.`);
  const prev = new Map<string, Question>(existing.map((q) => [q.id, q]));
  const qIds = new Set<string>();
  return raw.map((rq, qi): Question => {
    const where = `Question ${qi + 1}`;
    if (!isObj(rq)) throw badRequest(`${where} is invalid.`);
    let id = typeof rq.id === "string" && ID_RE.test(rq.id) ? rq.id : newId("q_");
    if (qIds.has(id)) id = newId("q_");
    qIds.add(id);
    const type = rq.type as QuestionType;
    if (!QUESTION_TYPES.includes(type)) throw badRequest(`${where}: unknown type.`);
    const isChoice = type === "single" || type === "multiple";
    const q: Question = {
      id,
      type,
      title: cleanLine(rq.title, LIMITS.questionTitle),
      required: rq.required === undefined ? true : !!rq.required,
      options: [],
      maxChoices: null,
      allowSuggestions: isChoice && !!rq.allowSuggestions,
    };
    const description = cleanBlock(rq.description, LIMITS.questionDescription);
    if (description) q.description = description;
    q.media = sanitizeMedia(rq.media, true, where);

    if (isChoice) {
      const rawOpts = rq.options === undefined ? [] : rq.options;
      if (!Array.isArray(rawOpts)) throw badRequest(`${where}: options must be an array.`);
      if (rawOpts.length > LIMITS.options) throw badRequest(`${where}: at most ${LIMITS.options} options.`);
      const prevOpts = new Map<string, Option>((prev.get(id)?.options ?? []).map((o) => [o.id, o]));
      const oIds = new Set<string>();
      for (const [oi, ro] of rawOpts.entries()) {
        if (!isObj(ro)) throw badRequest(`${where}, option ${oi + 1} is invalid.`);
        let oid = typeof ro.id === "string" && ID_RE.test(ro.id) ? ro.id : newId("o_");
        if (oIds.has(oid)) oid = newId("o_");
        oIds.add(oid);
        const opt: Option = {
          id: oid,
          label: cleanLine(ro.label, LIMITS.optionLabel),
          media: sanitizeMedia(ro.media, false, `${where}, option ${oi + 1}`),
          suggestedBy: prevOpts.get(oid)?.suggestedBy ?? null,
        };
        q.options.push(opt);
      }
      // keep voter suggestions the payload did not know about
      for (const o of prevOpts.values()) {
        if (o.suggestedBy && !oIds.has(o.id) && q.options.length < LIMITS.options) q.options.push(o);
      }
      if (type === "multiple" && rq.maxChoices !== undefined && rq.maxChoices !== null) {
        const n = Number(rq.maxChoices);
        if (!Number.isInteger(n) || n < 1 || n > LIMITS.options) throw badRequest(`${where}: maxChoices must be 1..${LIMITS.options} or null.`);
        q.maxChoices = n;
      }
    }
    return q;
  });
}

export function sanitizeSettings(raw: unknown, base: PollSettings): PollSettings {
  if (raw === undefined || raw === null) return { ...base };
  if (!isObj(raw)) throw badRequest("settings must be an object.");
  const s: PollSettings = { ...base };
  if (raw.access !== undefined) {
    if (raw.access !== "org" && raw.access !== "public") throw badRequest("settings.access must be org or public.");
    s.access = raw.access;
  }
  if (raw.resultsVisibility !== undefined) {
    const v = raw.resultsVisibility;
    if (v !== "always" && v !== "after_vote" && v !== "after_close" && v !== "owner_only") throw badRequest("settings.resultsVisibility is invalid.");
    s.resultsVisibility = v;
  }
  for (const k of ["showVoteCounts", "showVoterNames", "anonymous"] as const) {
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== "boolean") throw badRequest(`settings.${k} must be true or false.`);
      s[k] = raw[k] as boolean;
    }
  }
  if (raw.closesAt !== undefined) {
    if (raw.closesAt === null || raw.closesAt === "") s.closesAt = null;
    else {
      const t = typeof raw.closesAt === "string" ? Date.parse(raw.closesAt) : NaN;
      if (Number.isNaN(t)) throw badRequest("settings.closesAt must be an ISO date or null.");
      s.closesAt = new Date(t).toISOString();
    }
  }
  if (raw.theme !== undefined) {
    const t = raw.theme;
    if (t !== "teal" && t !== "blue" && t !== "mint" && t !== "sunset") throw badRequest("settings.theme is invalid.");
    s.theme = t;
  }
  return s;
}

/** Rules a poll must satisfy to be opened. */
export function validateForPublish(poll: Pick<Poll, "title" | "questions">): void {
  if (!poll.title.trim()) throw badRequest("Give your poll a title before publishing.");
  if (poll.questions.length === 0) throw badRequest("Add at least one question before publishing.");
  poll.questions.forEach((q, i) => {
    if (!q.title.trim()) throw badRequest(`Question ${i + 1} needs a title.`);
    if (q.type === "single" || q.type === "multiple") {
      if (q.options.some((o) => !o.label.trim())) throw badRequest(`Question ${i + 1} has an empty option.`);
      if (q.options.length === 0 && !q.allowSuggestions) throw badRequest(`Question ${i + 1} needs at least one option.`);
    }
  });
}

/** Apply a (partial) PollInput to a poll. Pure: returns a new Poll, does not persist. */
export function applyPollInput(base: Poll, raw: unknown, opts: { create: boolean }): Poll {
  if (!isObj(raw)) throw badRequest("Body must be a JSON object.");
  const p: Poll = { ...base, settings: { ...base.settings }, questions: base.questions };
  if (raw.title !== undefined || opts.create) {
    p.title = cleanLine(raw.title, LIMITS.title);
    if (opts.create && !p.title) p.title = "Untitled poll";
  }
  if (raw.description !== undefined) p.description = cleanBlock(raw.description, LIMITS.description);
  if (raw.cover !== undefined) p.cover = sanitizeMedia(raw.cover, true, "Cover");
  if (raw.settings !== undefined) p.settings = sanitizeSettings(raw.settings, base.settings);
  if (raw.questions !== undefined) p.questions = sanitizeQuestions(raw.questions, base.questions);
  if (raw.status !== undefined) {
    if (!STATUSES.includes(raw.status as PollStatus)) throw badRequest("status must be draft, open or closed.");
    p.status = raw.status as PollStatus;
  }
  // Publish rules are checked when a poll is opened (not on every autosave of an open poll).
  if (p.status === "open" && base.status !== "open") {
    validateForPublish(p);
  }
  return p;
}

/* ---------------- status & access ---------------- */

export function effectiveStatus(poll: Pick<Poll, "status" | "settings">, now = Date.now()): PollStatus {
  if (poll.status === "open" && poll.settings.closesAt && Date.parse(poll.settings.closesAt) <= now) return "closed";
  return poll.status;
}

export function withEffectiveStatus(poll: Poll, now = Date.now()): Poll {
  const status = effectiveStatus(poll, now);
  return status === poll.status ? poll : { ...poll, status };
}

export const isOwner = (poll: Pick<Poll, "ownerId">, user: User | null) => !!user && user.id === poll.ownerId;

/** Throws 401/403/404 unless `user` may read the poll. */
export function assertCanView(poll: Poll, user: User | null): asserts user is User {
  if (!user) throw unauthenticated("Sign in to open this poll.");
  if (isOwner(poll, user)) return;
  if (poll.status === "draft") throw notFound("Poll not found.");
  if (poll.settings.access === "org") {
    if (user.kind === "guest") throw wrongTenant("This poll is for members of the organisation. Sign in with your work account.");
    if (!user.tenantId || user.tenantId !== poll.tenantId) throw wrongTenant();
  }
}

/** Throws unless `user` may submit answers/suggestions now. */
export function assertCanVote(poll: Poll, user: User | null, now = Date.now()): asserts user is User {
  assertCanView(poll, user);
  const status = effectiveStatus(poll, now);
  if (status === "draft") throw closed("This poll is not open yet. Publish it to start collecting votes.");
  if (status === "closed") throw closed();
}

export function assertOwner(poll: Poll, user: User | null): asserts user is User {
  if (!user) throw unauthenticated();
  if (!isOwner(poll, user)) {
    // Do not reveal drafts to non-owners.
    if (poll.status === "draft") throw notFound("Poll not found.");
    throw forbidden("Only the poll owner can do that.");
  }
}

export function canSeeResults(poll: Poll, user: User | null, myResponse: PollResponse | null, now = Date.now()): boolean {
  if (isOwner(poll, user)) return true;
  switch (poll.settings.resultsVisibility) {
    case "always": return true;
    case "after_vote": return !!myResponse?.completed;
    case "after_close": return effectiveStatus(poll, now) === "closed";
    default: return false;
  }
}

/** Shape a poll for a viewer: effective status; anonymous polls hide who suggested an option (except to the suggester). */
export function pollForViewer(poll: Poll, user: User | null): Poll {
  const p = withEffectiveStatus(poll);
  if (!p.settings.anonymous) return p;
  return {
    ...p,
    questions: p.questions.map((q) => ({
      ...q,
      options: q.options.map((o) =>
        o.suggestedBy && o.suggestedBy.userId !== user?.id
          ? { ...o, suggestedBy: { userId: "", name: "Anonymous" } satisfies SuggestedBy }
          : o,
      ),
    })),
  };
}

/* ---------------- persistence ---------------- */

export function rowToPoll(r: Row): Poll {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    description: String(r.description ?? ""),
    cover: parseJson<Media | null>(r.cover, null),
    ownerId: String(r.owner_id),
    ownerName: String(r.owner_name),
    tenantId: r.tenant_id == null ? null : String(r.tenant_id),
    status: String(r.status) as PollStatus,
    settings: { ...DEFAULT_SETTINGS, ...parseJson<Partial<PollSettings>>(r.settings, {}) },
    questions: parseJson<Question[]>(r.questions, []),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/**
 * Stored poll (status NOT adjusted for closesAt) by id or slug.
 * `forUpdate` row-locks it; only meaningful inside tx().
 */
export async function getPollRaw(idOrSlug: string, opts: { forUpdate?: boolean } = {}): Promise<Poll | null> {
  if (!idOrSlug || idOrSlug.length > 64) return null;
  const row = await queryOne(
    `SELECT * FROM polls WHERE id = $1 OR slug = $1 ORDER BY (id = $1) DESC LIMIT 1${opts.forUpdate ? " FOR UPDATE" : ""}`,
    [idOrSlug],
  );
  return row ? rowToPoll(row) : null;
}

export async function requirePoll(idOrSlug: string, opts: { forUpdate?: boolean } = {}): Promise<Poll> {
  const p = await getPollRaw(idOrSlug, opts);
  if (!p) throw notFound("Poll not found.");
  return p;
}

async function writePoll(p: Poll, insert: boolean): Promise<void> {
  const vals = [
    p.slug, p.ownerId, p.ownerName, p.tenantId, p.status, p.title, p.description,
    p.cover ? JSON.stringify(p.cover) : null, JSON.stringify(p.settings), JSON.stringify(p.questions),
    p.createdAt, p.updatedAt, p.id,
  ];
  if (insert) {
    await query(
      `INSERT INTO polls (slug, owner_id, owner_name, tenant_id, status, title, description, cover, settings, questions, created_at, updated_at, id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      vals,
    );
  } else {
    await query(
      `UPDATE polls SET slug = $1, owner_id = $2, owner_name = $3, tenant_id = $4, status = $5, title = $6, description = $7,
       cover = $8, settings = $9, questions = $10, created_at = $11, updated_at = $12 WHERE id = $13`,
      vals,
    );
  }
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const s = newSlug();
    if (!(await queryOne("SELECT 1 AS x FROM polls WHERE slug = $1 OR id = $1", [s]))) return s;
  }
  throw new Error("Could not allocate a unique slug");
}

export function blankPoll(user: User): Poll {
  const now = nowIso();
  return {
    id: newId("p_"),
    slug: "",
    title: "",
    description: "",
    cover: null,
    ownerId: user.id,
    ownerName: user.name,
    tenantId: user.tenantId,
    status: "draft",
    settings: { ...DEFAULT_SETTINGS },
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function createPoll(input: unknown, user: User): Promise<Poll> {
  const p = applyPollInput(blankPoll(user), input, { create: true });
  p.slug = await uniqueSlug();
  await writePoll(p, true);
  return p;
}

/** PATCH: re-reads the poll with a row lock so concurrent suggestions/edits are not lost. */
export async function updatePoll(poll: Poll, input: unknown): Promise<Poll> {
  return tx(async () => {
    const fresh = await requirePoll(poll.id, { forUpdate: true });
    const p = applyPollInput(fresh, input, { create: false });
    p.updatedAt = nowIso();
    await writePoll(p, false);
    return p;
  });
}

/** Persist a poll as-is (call inside tx() after reading it FOR UPDATE). */
export async function savePoll(poll: Poll): Promise<Poll> {
  const p = { ...poll, updatedAt: nowIso() };
  await writePoll(p, false);
  return p;
}

export async function deletePoll(id: string): Promise<void> {
  await query("DELETE FROM polls WHERE id = $1", [id]);
}

export async function duplicatePoll(poll: Poll, user: User): Promise<Poll> {
  const now = nowIso();
  const copy: Poll = {
    ...structuredClone(poll),
    id: newId("p_"),
    slug: await uniqueSlug(),
    title: `${poll.title} (copy)`.slice(0, LIMITS.title),
    ownerId: user.id,
    ownerName: user.name,
    tenantId: user.tenantId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await writePoll(copy, true);
  return copy;
}

export async function listMyPolls(user: User): Promise<PollSummary[]> {
  const rows = await query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM responses r WHERE r.poll_id = p.id)::int AS started,
       (SELECT COUNT(*) FROM responses r WHERE r.poll_id = p.id AND r.completed)::int AS completed
     FROM polls p WHERE p.owner_id = $1 ORDER BY p.updated_at DESC, p.created_at DESC`,
    [user.id],
  );
  return rows.map((r) => {
    const p = withEffectiveStatus(rowToPoll(r));
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      access: p.settings.access,
      questionCount: p.questions.length,
      started: Number(r.started ?? 0),
      completed: Number(r.completed ?? 0),
      updatedAt: p.updatedAt,
    };
  });
}

export async function completedCount(pollId: string): Promise<number> {
  const r = await queryOne("SELECT COUNT(*)::int AS n FROM responses WHERE poll_id = $1 AND completed", [pollId]);
  return Number(r?.n ?? 0);
}

export async function buildPollView(poll: Poll, user: User, myResponse: PollResponse | null): Promise<PollView> {
  const owner = isOwner(poll, user);
  return {
    poll: pollForViewer(poll, user),
    isOwner: owner,
    myResponse,
    canSeeResults: canSeeResults(poll, user, myResponse),
    participantCount: owner || poll.settings.showVoteCounts ? await completedCount(poll.id) : null,
  };
}
