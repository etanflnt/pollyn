// Builder draft model, server mapping and validation. Owner: Leonardo.
import type { Media, Poll, PollInput, PollSettings, Question } from "@/lib/types";
import { isValidHttpUrl, toVideoEmbed } from "@/lib/media";
import { DEFAULT_SETTINGS } from "./templates";

export interface Draft {
  title: string;
  description: string;
  cover: Media | null;
  settings: PollSettings;
  questions: Question[];
}

export const STEPS = [
  { key: "basics", label: "Basics", short: "Basics" },
  { key: "questions", label: "Questions", short: "Questions" },
  { key: "settings", label: "Settings", short: "Settings" },
  { key: "publish", label: "Preview & publish", short: "Publish" },
] as const;
export type StepIndex = 0 | 1 | 2 | 3;

export const isChoice = (q: Pick<Question, "type">) => q.type === "single" || q.type === "multiple";

export function emptyDraft(): Draft {
  return { title: "", description: "", cover: null, settings: { ...DEFAULT_SETTINGS }, questions: [] };
}

export function fromPoll(p: Poll): Draft {
  return {
    title: p.title ?? "",
    description: p.description ?? "",
    cover: p.cover ?? null,
    settings: { ...DEFAULT_SETTINGS, ...p.settings },
    questions: (p.questions ?? []).map((q) => ({ ...q, options: q.options ?? [] })),
  };
}

export function fromInput(i: PollInput): Draft {
  return {
    title: i.title ?? "",
    description: i.description ?? "",
    cover: i.cover ?? null,
    settings: { ...DEFAULT_SETTINGS, ...i.settings },
    questions: i.questions ?? [],
  };
}

/** What we send to the server: blank option rows are dropped, blank title is omitted (drafts stay lenient). */
export function toInput(d: Draft): PollInput {
  const questions = d.questions.map((q) => ({
    ...q,
    title: q.title.trim(),
    description: q.description?.trim() ?? "",
    options: isChoice(q) ? q.options.filter((o) => o.label.trim()).map((o) => ({ ...o, label: o.label.trim() })) : [],
    maxChoices: q.type === "multiple" ? q.maxChoices ?? null : null,
    allowSuggestions: isChoice(q) ? q.allowSuggestions : false,
  }));
  const input: PollInput = { title: d.title.trim(), description: d.description.trim(), cover: d.cover, settings: d.settings, questions };
  if (!input.title) delete (input as Partial<PollInput>).title;
  return input;
}

export interface Issue {
  id: string;
  step: StepIndex;
  severity: "error" | "warn";
  message: string;
  questionId?: string;
}

export function mediaProblem(m: Media | null | undefined): string | null {
  if (!m?.url) return null;
  if (m.kind === "video") return toVideoEmbed(m.url) ? null : "This video link can't be embedded";
  if (m.url.startsWith("/")) return null;
  return isValidHttpUrl(m.url) ? null : "Image URL looks invalid";
}

export function validate(d: Draft): Issue[] {
  const out: Issue[] = [];
  if (!d.title.trim()) out.push({ id: "title", step: 0, severity: "error", message: "Give your poll a title" });
  const cm = mediaProblem(d.cover);
  if (cm) out.push({ id: "cover", step: 0, severity: "error", message: `Cover: ${cm}` });
  if (d.questions.length === 0) out.push({ id: "noq", step: 1, severity: "error", message: "Add at least one question" });
  d.questions.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    if (!q.title.trim()) out.push({ id: `qt_${q.id}`, step: 1, severity: "error", questionId: q.id, message: `${n} needs a title` });
    if (isChoice(q)) {
      const filled = q.options.filter((o) => o.label.trim());
      if (filled.length < 2) out.push({ id: `qo_${q.id}`, step: 1, severity: "error", questionId: q.id, message: `${n} needs at least 2 options` });
      const seen = new Set<string>();
      const dupe = filled.some((o) => { const k = o.label.trim().toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; });
      if (dupe) out.push({ id: `qd_${q.id}`, step: 1, severity: "warn", questionId: q.id, message: `${n} has duplicate options` });
      if (q.type === "multiple" && q.maxChoices != null && q.maxChoices > filled.length && filled.length >= 2)
        out.push({ id: `qm_${q.id}`, step: 1, severity: "warn", questionId: q.id, message: `${n}: max choices is more than the number of options` });
    }
    const mm = mediaProblem(q.media);
    if (mm) out.push({ id: `qmd_${q.id}`, step: 1, severity: "error", questionId: q.id, message: `${n}: ${mm}` });
  });
  if (d.settings.closesAt && new Date(d.settings.closesAt).getTime() <= Date.now())
    out.push({ id: "closes", step: 2, severity: "error", message: "Closing time is in the past" });
  return out;
}

/* ---------- date helpers for <input type="datetime-local"> ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
