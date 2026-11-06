"use client";
// Question renderers for the voter flow: choice tiles (single/multiple, text or image), stars, free text,
// plus the inline "Suggest an option" box. Owner: Ada.
import { useRef, useState, type KeyboardEvent } from "react";
import type { Answer, ID, Option, Question } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/client/api";
import { Button, cx, useToast } from "@/components/ui";
import { RATING_LABELS, pop, shake } from "./answers";
import s from "./vote.module.css";

interface BaseProps {
  question: Question;
  answer: Answer | undefined;
  onChange: (a: Answer) => void;
  /** Enter pressed on a tile / Ctrl+Enter in text: go next. */
  onSubmitKey: () => void;
  labelledBy: string;
}

/* ------------------------------------------------------------------ Choice */
export function ChoiceInput({ question: q, answer, onChange, onSubmitKey, labelledBy, pollId, userId, newOptionIds, onOptionAdded }: BaseProps & {
  pollId: ID; userId: ID | null; newOptionIds: Set<ID>; onOptionAdded: (qid: ID, o: Option) => void;
}) {
  const selected = answer?.optionIds ?? [];
  const multi = q.type === "multiple";
  const max = multi ? q.maxChoices ?? null : 1;
  const hasImages = q.options.some((o) => o.media?.kind === "image" && o.media.url);
  const refs = useRef<Record<ID, HTMLButtonElement | null>>({});
  const hintRef = useRef<HTMLDivElement>(null);
  const [limitHit, setLimitHit] = useState(false);

  const select = (id: ID) => {
    if (!multi) { onChange({ optionIds: [id] }); return; }
    if (selected.includes(id)) { setLimitHit(false); onChange({ optionIds: selected.filter((x) => x !== id) }); return; }
    if (max && selected.length >= max) {
      setLimitHit(true);
      shake(refs.current[id]); shake(hintRef.current);
      return;
    }
    onChange({ optionIds: [...selected, id] });
  };

  // Radiogroup keyboard: arrows move focus (and selection for single). Enter = next.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === "Enter") { e.preventDefault(); onSubmitKey(); return; }
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = q.options[(idx + delta + q.options.length) % q.options.length];
    if (!next) return;
    refs.current[next.id]?.focus();
    if (!multi) onChange({ optionIds: [next.id] });
  };

  const tabStop = !multi ? (selected[0] ?? q.options[0]?.id) : null;

  return (
    <div className="tp-stack" style={{ gap: 12 }}>
      {multi ? (
        <div ref={hintRef} className={cx(s.limitHint, limitHit && s.limitHintHot)} aria-live="polite">
          {max ? <>Pick up to <b>{max}</b> · {selected.length} of {max} selected</> : <>Pick as many as you like · {selected.length} selected</>}
        </div>
      ) : null}
      <div role={multi ? "group" : "radiogroup"} aria-labelledby={labelledBy} className={hasImages ? s.imageGrid : s.choiceList}>
        {q.options.map((o, idx) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              ref={(el) => { refs.current[o.id] = el; }}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              tabIndex={multi ? 0 : tabStop === o.id ? 0 : -1}
              className={cx("tp-choice", hasImages && s.imageTile, newOptionIds.has(o.id) && s.optNew)}
              onClick={() => select(o.id)}
              onKeyDown={(e) => onKey(e, idx)}
            >
              {hasImages ? (
                <span className={s.tileImg} aria-hidden>
                  {o.media?.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={o.media.url} alt="" loading="lazy" />
                    : <span className={s.tileImgFallback}>{o.label.slice(0, 1).toUpperCase()}</span>}
                </span>
              ) : null}
              <span className={cx("tp-choice-mark", multi && "square", hasImages && s.tileMark)} aria-hidden>
                {on ? <CheckIcon /> : null}
              </span>
              <span className={s.choiceText}>
                <span className={s.choiceLabel}>{o.label}</span>
                {o.suggestedBy ? (
                  <span className={s.suggestChip}>✨ suggested by {o.suggestedBy.userId === userId ? "you" : o.suggestedBy.name}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {q.allowSuggestions ? (
        <SuggestBox pollId={pollId} question={q} onAdded={(o) => {
          onOptionAdded(q.id, o);
          if (!multi) onChange({ optionIds: [o.id] });
          else if (!selected.includes(o.id)) {
            if (max && selected.length >= max) { setLimitHit(true); shake(hintRef.current); }
            else onChange({ optionIds: [...selected, o.id] });
          }
        }} />
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
}

function SuggestBox({ pollId, question, onAdded }: { pollId: ID; question: Question; onAdded: (o: Option) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const clean = label.trim();
    if (!clean) { shake(inputRef.current); return; }
    setBusy(true);
    try {
      const o = await api<Option>(`/api/polls/${pollId}/questions/${question.id}/suggestions`, { method: "POST", json: { label: clean } });
      const existed = question.options.some((x) => x.id === o.id);
      onAdded(o);
      toast(existed ? `"${o.label}" is already an option, picked it for you` : `Added "${o.label}"`);
      setLabel(""); setOpen(false);
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.body.error : "Could not add your suggestion", "error");
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" className={s.suggestOpen} onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }}>
        <span aria-hidden>＋</span> Suggest an option
      </button>
    );
  }
  return (
    <form className={cx(s.suggestForm, "tp-enter")} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <input
        ref={inputRef}
        className="tp-input"
        value={label}
        maxLength={60}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setLabel(""); } }}
        placeholder="Your idea…"
        aria-label="Suggest an option"
      />
      <Button type="submit" variant="primary" loading={busy} disabled={!label.trim()}>Add</Button>
      <Button type="button" variant="ghost" onClick={() => { setOpen(false); setLabel(""); }} aria-label="Cancel suggestion">✕</Button>
    </form>
  );
}

/* ------------------------------------------------------------------ Rating */
export function RatingInput({ answer, onChange, onSubmitKey, labelledBy }: BaseProps) {
  const value = answer?.rating ?? 0;
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;

  const set = (v: number) => { onChange({ rating: v }); pop(refs.current[v - 1]); };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, v: number) => {
    if (e.key === "Enter") { e.preventDefault(); onSubmitKey(); return; }
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = Math.max(1, Math.min(5, v + d));
    refs.current[n - 1]?.focus(); set(n);
  };

  return (
    <div className={s.rating}>
      <div role="radiogroup" aria-labelledby={labelledBy} className={s.stars} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            ref={(el) => { refs.current[v - 1] = el; }}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${v} star${v > 1 ? "s" : ""}: ${RATING_LABELS[v - 1]}`}
            tabIndex={(value || 1) === v ? 0 : -1}
            className={cx(s.star, v <= shown && s.starOn)}
            onMouseEnter={() => setHover(v)}
            onClick={() => set(v)}
            onKeyDown={(e) => onKey(e, v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2.8l2.84 5.76 6.36.92-4.6 4.49 1.08 6.33L12 17.31l-5.68 2.99 1.08-6.33-4.6-4.49 6.36-.92z" /></svg>
          </button>
        ))}
      </div>
      <div className={s.ratingLabel} aria-live="polite">{shown ? RATING_LABELS[shown - 1] : "Tap a star"}</div>
    </div>
  );
}

/* -------------------------------------------------------------------- Text */
export const TEXT_MAX = 1000;
export function TextInput({ answer, onChange, onSubmitKey, labelledBy }: BaseProps) {
  const v = answer?.text ?? "";
  return (
    <div className="tp-field">
      <textarea
        className={cx("tp-textarea", s.textArea)}
        aria-labelledby={labelledBy}
        value={v}
        maxLength={TEXT_MAX}
        rows={5}
        placeholder="Type your answer…"
        onChange={(e) => onChange({ text: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmitKey(); } }}
      />
      <div className={s.textMeta}>
        <span className="hide-sm">Ctrl + Enter to continue</span>
        <span className={cx(v.length > TEXT_MAX * 0.9 && s.textMetaWarn)}>{v.length} / {TEXT_MAX}</span>
      </div>
    </div>
  );
}
