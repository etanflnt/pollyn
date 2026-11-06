// Pure helpers for the voter flow. Owner: Ada.
import type { Answer, Poll, Question } from "@/lib/types";

export function isAnswered(q: Question, a: Answer | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "single":
    case "multiple": return (a.optionIds?.length ?? 0) > 0;
    case "rating": return typeof a.rating === "number" && a.rating >= 1;
    case "text": return !!a.text?.trim();
  }
}

export const RATING_LABELS = ["Not great", "Meh", "Okay", "Good", "Love it"] as const;

/** One-line human summary of an answer, for the review step. */
export function summarize(q: Question, a: Answer | undefined): string | null {
  if (!isAnswered(q, a)) return null;
  switch (q.type) {
    case "single":
    case "multiple":
      return a!.optionIds!.map((id) => q.options.find((o) => o.id === id)?.label ?? "Removed option").join(", ");
    case "rating": return `${"★".repeat(a!.rating!)}${"☆".repeat(5 - a!.rating!)}  ${RATING_LABELS[a!.rating! - 1]}`;
    case "text": return a!.text!.trim();
  }
}

/** Rough completion estimate in seconds. */
export function estimateSeconds(poll: Poll): number {
  return poll.questions.reduce((s, q) => s + (q.type === "text" ? 35 : q.type === "rating" ? 6 : 10 + q.options.length), 0);
}
export function estimateLabel(poll: Poll): string {
  const s = estimateSeconds(poll);
  return s < 60 ? "under a minute" : `about ${Math.round(s / 60)} min`;
}

export function isClosed(poll: Poll): boolean {
  return poll.status === "closed" || (!!poll.settings.closesAt && new Date(poll.settings.closesAt).getTime() <= Date.now());
}

/** Clamp an arbitrary stored step into the valid range for this poll. */
export function clampStep(step: number, poll: Poll): number {
  return Math.max(0, Math.min(poll.questions.length + 1, Math.floor(step || 0)));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Gentle horizontal shake (WAAPI) for "can't do that" feedback. */
export function shake(el: Element | null | undefined) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
    { duration: 320, easing: "ease-out" },
  );
}

/** Small scale "pop" (WAAPI). */
export function pop(el: Element | null | undefined) {
  if (!el || prefersReducedMotion()) return;
  el.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
}
