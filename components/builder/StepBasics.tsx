"use client";
import { Field, Input, Textarea } from "@/components/ui";
import type { Draft, Issue } from "./draft";
import { MediaPicker } from "./MediaPicker";
import s from "./Builder.module.css";

export function StepBasics({ draft, onChange, issues, autoFocus, onSubmit }: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  issues: Issue[];
  autoFocus?: boolean;
  /** Enter in the title field continues to the next step. */
  onSubmit?: () => void;
}) {
  const coverIssue = issues.find((i) => i.id === "cover");
  return (
    <div className={s.stepBody}>
      <header className={s.stepHead}>
        <span className="tp-eyebrow">Step 1 · Basics</span>
        <h1 className="tp-h1">What are we <strong>deciding?</strong></h1>
        <p className="tp-muted">A clear title gets more votes. Add a picture or video if it helps people choose.</p>
      </header>

      <Field label="Poll title" htmlFor="b-title" hint={<span className={s.counter}>{draft.title.length}/120</span>}>
        <Input id="b-title" large value={draft.title} maxLength={120} autoFocus={autoFocus}
          placeholder="e.g. Friday lunch — where are we going?"
          enterKeyHint="next"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit?.(); } }}
          onChange={(e) => onChange({ title: e.target.value })} />
      </Field>

      <Field label={<>Description <span className="tp-muted">(optional)</span></>} htmlFor="b-desc">
        <Textarea id="b-desc" value={draft.description} maxLength={1000} rows={3}
          placeholder="Context, deadline, or a fun note for voters"
          onChange={(e) => onChange({ description: e.target.value })} />
      </Field>

      <div className="tp-field">
        <span className="tp-label">Cover <span className="tp-muted">(optional)</span></span>
        <MediaPicker value={draft.cover} onChange={(cover) => onChange({ cover })} />
        {coverIssue ? <span className={s.inlineIssue} role="alert">{coverIssue.message}</span> : null}
      </div>
    </div>
  );
}
