"use client";
// Entry source picker + live entry preview + number of winners. Owner: Woz.
import type { Entry, EntrySource, Question } from "@/lib/types";
import { Card, Field, Segmented, Textarea, Toggle } from "@/components/ui";
import { MAX_ENTRIES, totalTickets } from "./lib";
import s from "./GamesArcade.module.css";

export interface SourcePanelProps {
  source: EntrySource;
  onSource: (v: EntrySource) => void;
  bonus: boolean;
  onBonus: (v: boolean) => void;
  questions: Question[];
  questionId: string;
  onQuestion: (id: string) => void;
  customText: string;
  onCustomText: (v: string) => void;
  truncated: boolean;
  entries: Entry[];
  placeholder: boolean;
  /** Entries come from a finished draw (authoritative) rather than the preview. */
  fromDraw: boolean;
  winners: number;
  maxWinners: number;
  onWinners: (n: number) => void;
  locked: boolean;
}

export function EntrySourcePanel(p: SourcePanelProps) {
  const tickets = totalTickets(p.entries);
  return (
    <Card className={s.panel}>
      <fieldset className={s.fieldset} disabled={p.locked}>
        <legend className={s.panelTitle}>
          <span className="tp-eyebrow">Step 1</span>
          <span className="tp-h3">Who's in the draw?</span>
        </legend>

        <Segmented<EntrySource>
          ariaLabel="Entry source"
          value={p.source}
          onChange={p.onSource}
          options={[
            { value: "participants", label: "Voters" },
            { value: "options", label: "Poll options" },
            { value: "custom", label: "Custom list" },
          ]}
        />

        {p.source === "participants" ? (
          <div className={s.sourceBody}>
            <p className="tp-hint" style={{ margin: 0 }}>Everyone who completed the poll gets 1 ticket.</p>
            <Toggle checked={p.bonus} onChange={p.onBonus} label="+1 ticket per suggestion" hint="Reward voters who added their own option." />
          </div>
        ) : null}

        {p.source === "options" ? (
          <div className={s.sourceBody}>
            {p.questions.length ? (
              <Field label="Question" htmlFor="games-question" hint="Each option gets 1 ticket per vote (minimum 1) — great for “spin to pick lunch from the top choices”.">
                <select id="games-question" className="tp-select" value={p.questionId} onChange={(e) => p.onQuestion(e.target.value)}>
                  {p.questions.map((q, i) => <option key={q.id} value={q.id}>{`Q${i + 1}. ${q.title || "Untitled question"}`}</option>)}
                </select>
              </Field>
            ) : (
              <p className="tp-hint" style={{ margin: 0 }}>This poll has no single or multiple choice questions with options yet.</p>
            )}
          </div>
        ) : null}

        {p.source === "custom" ? (
          <div className={s.sourceBody}>
            <Field
              label="Entries, one per line"
              htmlFor="games-custom"
              hint={<>Add <code className={s.code}>x3</code> after a name for extra tickets, e.g. <code className={s.code}>Priya x3</code> (1–100). Up to {MAX_ENTRIES} lines.</>}
            >
              <Textarea id="games-custom" rows={6} value={p.customText} onChange={(e) => p.onCustomText(e.target.value)} placeholder={"Alex\nSam x3\nPriya\nTaco Tuesday x2"} spellCheck={false} />
            </Field>
            {p.truncated ? <p className="tp-hint" style={{ margin: 0, color: "var(--warn)" }}>Only the first {MAX_ENTRIES} lines are used.</p> : null}
          </div>
        ) : null}

        <div className={s.previewHead}>
          <span className="tp-label">{p.fromDraw ? "In this draw" : "Entries"}</span>
          <span className="tp-badge">{p.entries.length} {p.entries.length === 1 ? "entry" : "entries"}{p.placeholder ? "" : ` · ${tickets} ${tickets === 1 ? "ticket" : "tickets"}`}</span>
        </div>
        {p.placeholder ? (
          <div className={s.voterCount}>
            <span className={s.voterNum}>{p.entries.length}</span>
            <span className="tp-small tp-muted">{p.entries.length === 1 ? "voter has" : "voters have"} completed the poll. Names are revealed by the draw.</span>
          </div>
        ) : p.entries.length ? (
          <ul className={s.preview} aria-label="Entry preview">
            {p.entries.map((e, i) => (
              <li key={i} className={s.previewRow}>
                <span className={s.previewName} title={e.label}>{e.label}</span>
                <span className={s.ticketChip}>{e.weight} {e.weight === 1 ? "ticket" : "tickets"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tp-hint" style={{ margin: 0 }}>No entries yet.</p>
        )}

        <div className={s.winnersRow}>
          <span>
            <span className="tp-label" id="games-winners-label">Number of winners</span>
            <span className="tp-hint" style={{ display: "block" }}>No one wins twice.</span>
          </span>
          <div className={s.stepper} role="group" aria-labelledby="games-winners-label">
            <button type="button" className="tp-btn tp-btn-secondary tp-btn-icon" aria-label="Fewer winners" disabled={p.winners <= 1} onClick={() => p.onWinners(p.winners - 1)}>−</button>
            <output className={s.stepValue} aria-live="polite">{p.winners}</output>
            <button type="button" className="tp-btn tp-btn-secondary tp-btn-icon" aria-label="More winners" disabled={p.winners >= p.maxWinners} onClick={() => p.onWinners(p.winners + 1)}>+</button>
          </div>
        </div>
      </fieldset>
    </Card>
  );
}
