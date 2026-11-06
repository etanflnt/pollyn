"use client";
import { useEffect, useState } from "react";
import type { Question, QuestionType } from "@/lib/types";
import { newId } from "@/lib/ids";
import { Button, cx } from "@/components/ui";
import type { Issue } from "./draft";
import { newQuestion } from "./templates";
import { QUESTION_TYPES, QuestionCard } from "./QuestionCard";
import { Icon } from "./icons";
import s from "./Builder.module.css";

const smooth = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

export function StepQuestions({ questions, onChange, issues, focusId }: {
  questions: Question[];
  /** Question to open on mount (e.g. from the publish checklist). */
  focusId?: string;
  onChange: (q: Question[]) => void;
  issues: Issue[];
}) {
  const [activeId, setActiveId] = useState<string | null>(() => focusId ?? questions.find((q) => !q.title.trim())?.id ?? (questions.length === 1 ? questions[0]!.id : null));
  const [undo, setUndo] = useState<{ q: Question; index: number } | null>(null);

  useEffect(() => {
    if (focusId) requestAnimationFrame(() => document.getElementById(`qh_${focusId}`)?.scrollIntoView({ block: "center" }));
  }, [focusId]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const add = (type: QuestionType) => {
    const q = newQuestion(type);
    onChange([...questions, q]);
    setActiveId(q.id);
    requestAnimationFrame(() => document.getElementById(`qh_${q.id}`)?.scrollIntoView({ behavior: smooth(), block: "center" }));
  };
  const update = (q: Question) => onChange(questions.map((x) => (x.id === q.id ? q : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const next = questions.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`qh_${next[j]!.id}`)?.focus());
  };
  const duplicate = (i: number) => {
    const src = questions[i]!;
    const copy: Question = {
      ...src,
      id: newId("q_"),
      title: src.title ? `${src.title} (copy)` : "",
      options: src.options.map((o) => ({ ...o, id: newId("o_"), suggestedBy: null })),
    };
    const next = questions.slice();
    next.splice(i + 1, 0, copy);
    onChange(next);
    setActiveId(copy.id);
  };
  const remove = (i: number) => {
    const q = questions[i]!;
    onChange(questions.filter((_, k) => k !== i));
    setUndo({ q, index: i });
    if (activeId === q.id) setActiveId(null);
  };
  const restore = () => {
    if (!undo) return;
    const next = questions.slice();
    next.splice(Math.min(undo.index, next.length), 0, undo.q);
    onChange(next);
    setActiveId(undo.q.id);
    setUndo(null);
  };
  const noq = issues.find((i) => i.id === "noq");

  return (
    <div className={s.stepBody}>
      <header className={s.stepHead}>
        <span className="tp-eyebrow">Step 2 · Questions</span>
        <h1 className="tp-h1">What do you <strong>want to know?</strong></h1>
        <p className="tp-muted">Keep it short — 1 to 5 questions works best. Voters answer one question at a time.</p>
      </header>

      {questions.length ? (
        <div className={s.qList}>
          {questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} total={questions.length} active={activeId === q.id}
              onActivate={(open) => setActiveId(open ? q.id : null)}
              onChange={update} onMove={(d) => move(i, d)} onDuplicate={() => duplicate(i)} onDelete={() => remove(i)}
              issues={issues.filter((x) => x.questionId === q.id)} />
          ))}
        </div>
      ) : null}

      {undo ? (
        <div className={cx(s.undoBar, "tp-enter")} role="status">
          <span>Question deleted</span>
          <Button size="sm" variant="ghost" onClick={restore}>Undo</Button>
        </div>
      ) : null}

      <section className={s.addPanel} aria-labelledby="add-q-title">
        <div id="add-q-title" className={s.addPanelTitle}>
          <Icon name="plus" size={16} />{questions.length ? "Add another question" : "Add your first question"}
        </div>
        {noq && questions.length === 0 ? <p className="tp-muted tp-small" style={{ margin: "0 0 12px" }}>Pick a type to get started — you can change it later.</p> : null}
        <div className={s.typeGrid}>
          {QUESTION_TYPES.map((t) => (
            <button key={t.type} type="button" className={s.typeTile} onClick={() => add(t.type)}>
              <span className={s.typeTileIcon}><Icon name={t.icon} size={20} /></span>
              <span className={s.typeTileText}><strong>{t.label}</strong><span className="tp-hint">{t.hint}</span></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
