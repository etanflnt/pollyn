"use client";
// One question in the builder: collapsed summary row, expands to the full editor. Owner: Leonardo.
import { useRef, useState } from "react";
import type { Question, QuestionType } from "@/lib/types";
import { Field, Input, Textarea, Toggle, cx } from "@/components/ui";
import { isChoice, type Issue } from "./draft";
import { opt } from "./templates";
import { MediaPicker } from "./MediaPicker";
import { OptionsEditor } from "./OptionsEditor";
import { Icon, type IconName } from "./icons";
import s from "./Builder.module.css";

export const QUESTION_TYPES: { type: QuestionType; label: string; icon: IconName; hint: string }[] = [
  { type: "single", label: "Single choice", icon: "single", hint: "Pick one" },
  { type: "multiple", label: "Multiple choice", icon: "multiple", hint: "Pick several" },
  { type: "rating", label: "Rating", icon: "star", hint: "1–5 stars" },
  { type: "text", label: "Open text", icon: "text", hint: "Free answer" },
];
export const typeMeta = (t: QuestionType) => QUESTION_TYPES.find((x) => x.type === t)!;

export function QuestionCard({ q, index, total, active, onActivate, onChange, onMove, onDuplicate, onDelete, issues }: {
  q: Question;
  index: number;
  total: number;
  active: boolean;
  onActivate: (open: boolean) => void;
  onChange: (q: Question) => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  issues: Issue[];
}) {
  const stash = useRef<Question["options"] | null>(null);
  const [showDesc, setShowDesc] = useState(!!q.description);
  const [showMedia, setShowMedia] = useState(!!q.media?.url);
  const meta = typeMeta(q.type);
  const filled = q.options.filter((o) => o.label.trim()).length;
  const errors = issues.filter((i) => i.severity === "error");
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });

  const changeType = (type: QuestionType) => {
    if (type === q.type) return;
    const toChoice = type === "single" || type === "multiple";
    let options = q.options;
    if (isChoice(q) && !toChoice) { stash.current = q.options; options = []; }
    else if (!isChoice(q) && toChoice) { options = stash.current?.length ? stash.current : [opt(), opt()]; }
    set({ type, options, maxChoices: type === "multiple" ? q.maxChoices ?? null : null, allowSuggestions: toChoice ? q.allowSuggestions : false });
  };

  const summary = isChoice(q) ? `${filled} option${filled === 1 ? "" : "s"}` : meta.hint;
  const headId = `qh_${q.id}`;
  const bodyId = `qb_${q.id}`;

  return (
    <article className={cx(s.qCard, active && s.qCardActive, errors.length > 0 && !active && s.qCardIssue)} aria-labelledby={headId}>
      <button type="button" id={headId} className={s.qHead} aria-expanded={active} aria-controls={bodyId} onClick={() => onActivate(!active)}>
        <span className={s.qNum}>{index + 1}</span>
        <span className={s.qTypeIcon} title={meta.label}><Icon name={meta.icon} size={18} /></span>
        <span className={s.qHeadText}>
          <span className={cx(s.qTitle, !q.title.trim() && s.qTitleEmpty)}>{q.title.trim() || "Untitled question"}</span>
          <span className={s.qMeta}>
            {meta.label} · {summary}{q.required ? " · Required" : ""}{q.allowSuggestions ? " · Suggestions on" : ""}{q.media?.url ? ` · ${q.media.kind === "video" ? "🎬" : "🖼"}` : ""}
          </span>
        </span>
        {errors.length && !active ? <span className={s.qIssueBadge} aria-label={`${errors.length} issue(s)`}><Icon name="warn" size={14} />{errors.length}</span> : null}
        <span className={cx(s.qChevron, active && s.qChevronOpen)} aria-hidden><Icon name="down" size={18} /></span>
      </button>

      {active ? (
        <div id={bodyId} className={cx(s.qBody, "tp-enter")}>
          <div className={cx("tp-seg", s.typeSeg)} role="group" aria-label="Question type">
            {QUESTION_TYPES.map((t) => (
              <button key={t.type} type="button" aria-pressed={q.type === t.type} onClick={() => changeType(t.type)}>
                <Icon name={t.icon} size={15} /><span className={s.typeSegLabel}>{t.label}</span>
              </button>
            ))}
          </div>

          <Field label="Question" htmlFor={`qt_${q.id}`}>
            <Input id={`qt_${q.id}`} value={q.title} maxLength={200} autoFocus={!q.title}
              placeholder={q.type === "rating" ? "e.g. How was the venue?" : q.type === "text" ? "e.g. Anything we should know?" : "e.g. Where should we eat?"}
              onChange={(e) => set({ title: e.target.value })} />
          </Field>

          {showDesc ? (
            <Field label="Description" htmlFor={`qd_${q.id}`}>
              <Textarea id={`qd_${q.id}`} rows={2} value={q.description ?? ""} maxLength={600} placeholder="Extra context for voters"
                onChange={(e) => set({ description: e.target.value })} />
            </Field>
          ) : null}
          {showMedia ? (
            <div className="tp-field">
              <span className="tp-label">Reference image or video</span>
              <MediaPicker value={q.media} compact onChange={(media) => { set({ media }); if (!media) setShowMedia(false); }} />
            </div>
          ) : null}
          {!showDesc || !showMedia ? (
            <div className="tp-row" style={{ gap: 8 }}>
              {!showDesc ? <button type="button" className={s.addChip} onClick={() => setShowDesc(true)}><Icon name="plus" size={14} />Description</button> : null}
              {!showMedia ? <button type="button" className={s.addChip} onClick={() => setShowMedia(true)}><Icon name="image" size={14} />Image or video</button> : null}
            </div>
          ) : null}

          {isChoice(q) ? (
            <div className="tp-field">
              <span className="tp-label">Options</span>
              <OptionsEditor questionId={q.id} options={q.options} multiple={q.type === "multiple"} onChange={(options) => set({ options })} />
            </div>
          ) : q.type === "rating" ? (
            <div className={s.typePreview} aria-hidden>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={26} />)}<span className="tp-hint">Voters tap 1–5 stars</span></div>
          ) : (
            <div className={s.typePreview} aria-hidden><span className={s.fakeText}>Voters type their answer here…</span></div>
          )}

          <div className={s.qSettings}>
            <Toggle checked={q.required} onChange={(required) => set({ required })} label="Required" hint="Voters must answer before moving on" />
            {isChoice(q) ? (
              <Toggle checked={q.allowSuggestions} onChange={(allowSuggestions) => set({ allowSuggestions })} label="Allow suggestions" hint="Voters can add their own option 💡" />
            ) : null}
            {q.type === "multiple" ? (
              <div className={s.maxRow}>
                <label htmlFor={`qm_${q.id}`}><span style={{ fontWeight: 600, display: "block" }}>Max choices</span><span className="tp-hint">How many options a voter may pick</span></label>
                <select id={`qm_${q.id}`} className={cx("tp-select", s.maxSelect)} value={q.maxChoices ?? ""}
                  onChange={(e) => set({ maxChoices: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No limit</option>
                  {Array.from({ length: Math.max(1, filled - 1, q.maxChoices ?? 0) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Up to {n}</option>)}
                </select>
              </div>
            ) : null}
          </div>

          {issues.length ? (
            <ul className={s.issueList}>
              {issues.map((i) => <li key={i.id} className={i.severity === "error" ? s.issueErr : s.issueWarn}><Icon name="warn" size={14} />{i.message.replace(/^Question \d+:? ?/, "")}</li>)}
            </ul>
          ) : null}

          <footer className={s.qFoot}>
            <button type="button" className={s.iconBtn} onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move question up"><Icon name="up" size={18} /></button>
            <button type="button" className={s.iconBtn} onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move question down"><Icon name="down" size={18} /></button>
            <span className="tp-spacer" />
            <button type="button" className={s.textBtn} onClick={onDuplicate}><Icon name="copy" size={16} /><span>Duplicate</span></button>
            <button type="button" className={cx(s.textBtn, s.textBtnDanger)} onClick={onDelete}><Icon name="trash" size={16} /><span>Delete</span></button>
          </footer>
        </div>
      ) : null}
    </article>
  );
}
