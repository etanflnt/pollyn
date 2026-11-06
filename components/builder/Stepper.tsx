"use client";
// Numbered, clickable stepper with a progress rail + autosave indicator. Owner: Leonardo.
import { cx } from "@/components/ui";
import { STEPS, type StepIndex } from "./draft";
import { Icon } from "./icons";
import s from "./Builder.module.css";

export function Stepper({ step, onStep, locked, issueSteps }: {
  step: StepIndex;
  onStep: (i: StepIndex) => void;
  /** Steps that can't be opened yet (e.g. before the draft exists). */
  locked?: (i: StepIndex) => boolean;
  /** Steps that have blocking issues. */
  issueSteps?: Set<number>;
}) {
  const pct = (step / (STEPS.length - 1)) * 100;
  return (
    <nav className={s.stepper} aria-label="Poll builder steps">
      <div className={s.rail} aria-hidden><span style={{ width: `${pct}%` }} /></div>
      <ol>
        {STEPS.map((st, idx) => {
          const i = idx as StepIndex;
          const done = i < step;
          const current = i === step;
          const isLocked = locked?.(i) ?? false;
          const issue = issueSteps?.has(i) && !current;
          return (
            <li key={st.key} className={cx(s.stepItem, current && s.stepCurrent, done && s.stepDone)}>
              <button type="button" onClick={() => onStep(i)} disabled={isLocked} aria-current={current ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${st.label}${done ? " (done)" : ""}${issue ? " (needs attention)" : ""}`}>
                <span className={s.stepNum}>{done && !issue ? <Icon name="check" size={15} strokeWidth={3} /> : i + 1}{issue ? <span className={s.stepIssue} aria-hidden /> : null}</span>
                <span className={s.stepLabel}>{st.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  if (state === "idle") return null;
  return (
    <span className={cx(s.save, state === "error" && s.saveError)} role="status" aria-live="polite">
      {state === "saving" || state === "pending" ? <><span className={s.saveDot} />Saving…</> : null}
      {state === "saved" ? <><Icon name="check" size={14} strokeWidth={3} />Saved</> : null}
      {state === "error" ? <>Not saved · <button type="button" onClick={onRetry} className={s.linkBtn}>Retry</button></> : null}
    </span>
  );
}
