"use client";
// Per-question results: animated bars, voter chips, rating avg + distribution, text wall. Owner: Ada.
// Used by /polls/[id]/results and the voter thank-you screen.
import { useEffect, useState } from "react";
import type { Answer, ID, Poll, PollResults, Question, QuestionResult } from "@/lib/types";
import { cx } from "@/components/ui";
import s from "./results.module.css";

/** Flip to true one frame after mount so width transitions animate from 0. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(r); }, []);
  return m;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function ResultsBoard({ poll, results, isOwner, showCounts, mine, compact }: {
  poll: Poll; results: PollResults; isOwner: boolean; showCounts: boolean; mine?: Record<ID, Answer>; compact?: boolean;
}) {
  const byId = new Map(results.questions.map((r) => [r.questionId, r]));
  return (
    <div className={cx(s.board, compact && s.compact)}>
      {poll.questions.map((q, i) => {
        const r = byId.get(q.id);
        return (
          <section key={q.id} className={cx("tp-card", s.qCard, "tp-enter")} style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }} aria-labelledby={`rq-${q.id}`}>
            <header className={s.qHead}>
              <span className="tp-eyebrow">Q{i + 1} · {typeLabel(q)}</span>
              <h3 id={`rq-${q.id}`} className={s.qTitle}>{q.title}</h3>
              {showCounts && r ? <span className="tp-muted tp-small">{r.answered} {r.answered === 1 ? "answer" : "answers"}</span> : null}
            </header>
            {!r || r.answered === 0 ? <p className="tp-muted tp-small" style={{ margin: 0 }}>No answers yet.</p>
              : q.type === "rating" ? <RatingResult r={r} showCounts={showCounts} mine={mine?.[q.id]?.rating} />
              : q.type === "text" ? <TextWall r={r} anonymous={poll.settings.anonymous} />
              : <ChoiceBars q={q} r={r} showCounts={showCounts} isOwner={isOwner} mine={mine?.[q.id]?.optionIds} />}
          </section>
        );
      })}
    </div>
  );
}

function typeLabel(q: Question) {
  return q.type === "single" ? "Pick one" : q.type === "multiple" ? "Pick many" : q.type === "rating" ? "Rating" : "Open answer";
}

/* ---------------------------------------------------------------- Choices */
function ChoiceBars({ q, r, showCounts, isOwner, mine }: { q: Question; r: QuestionResult; showCounts: boolean; isOwner: boolean; mine?: ID[] }) {
  const mounted = useMounted();
  const counts = new Map(r.options.map((o) => [o.optionId, o]));
  const rows = q.options
    .map((o) => ({ o, count: counts.get(o.id)?.count ?? 0, voters: counts.get(o.id)?.voters ?? null }))
    .sort((a, b) => b.count - a.count);
  const top = rows[0]?.count ?? 0;
  return (
    <ol className={s.bars}>
      {rows.map(({ o, count, voters }) => {
        const p = pct(count, r.answered);
        const leader = top > 0 && count === top;
        const picked = mine?.includes(o.id);
        return (
          <li key={o.id} className={cx(s.barRow, leader && s.leader)}>
            <div className={s.barTop}>
              <span className={s.barLabel}>
                {leader ? <span className={s.crown} aria-label="Leading">👑</span> : null}
                {o.label}
                {picked ? <span className={s.youChip}>your pick</span> : null}
                {o.suggestedBy ? <span className={s.sugChip}>✨ {o.suggestedBy.name}</span> : null}
              </span>
              <span className={s.barNum}>
                <b>{p}%</b>{showCounts ? <span className="tp-muted"> · {count}</span> : null}
              </span>
            </div>
            <div className={s.track} role="img" aria-label={`${o.label}: ${p}%${showCounts ? `, ${count} votes` : ""}`}>
              <span className={s.fill} style={{ width: mounted ? `${Math.max(p, count > 0 ? 2 : 0)}%` : 0 }} />
            </div>
            {voters && voters.length > 0 ? <VoterChips names={voters} /> : null}
          </li>
        );
      })}
      {isOwner && rows.length === 0 ? <li className="tp-muted tp-small">No options.</li> : null}
    </ol>
  );
}

function VoterChips({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
  return (
    <div className={s.voters}>
      <button type="button" className={s.votersToggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden className={cx(s.caret, open && s.caretOpen)}>▸</span>
        {open ? `Hide ${names.length === 1 ? "voter" : `${names.length} voters`}` : preview}
      </button>
      {open ? (
        <div className={s.chips}>
          {names.map((n, i) => <span key={`${n}-${i}`} className={s.chip} style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}>{n}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Rating */
function RatingResult({ r, showCounts, mine }: { r: QuestionResult; showCounts: boolean; mine?: number }) {
  const mounted = useMounted();
  const dist = r.ratingDistribution ?? [0, 0, 0, 0, 0];
  const total = dist.reduce((a, b) => a + b, 0);
  const avg = r.ratingAverage ?? 0;
  return (
    <div className={s.rating}>
      <div className={s.ratingAvg}>
        <div className={s.avgNum}>{avg.toFixed(1)}</div>
        <div className={s.avgStars} aria-label={`Average ${avg.toFixed(1)} out of 5`}>
          <span className={s.starsBase}>★★★★★</span>
          <span className={s.starsFill} style={{ width: mounted ? `${(avg / 5) * 100}%` : 0 }}>★★★★★</span>
        </div>
        {mine ? <span className={s.youChip}>you gave {mine}★</span> : null}
      </div>
      <ol className={s.dist}>
        {[5, 4, 3, 2, 1].map((v) => {
          const c = dist[v - 1] ?? 0;
          return (
            <li key={v} className={s.distRow}>
              <span className={s.distLabel}>{v}★</span>
              <span className={s.track}><span className={s.fill} style={{ width: mounted ? `${pct(c, total)}%` : 0 }} /></span>
              <span className={s.distNum}>{showCounts ? c : `${pct(c, total)}%`}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------- Text */
function TextWall({ r, anonymous }: { r: QuestionResult; anonymous: boolean }) {
  const [all, setAll] = useState(false);
  const texts = r.texts ?? [];
  const shown = all ? texts : texts.slice(0, 12);
  return (
    <>
      <div className={s.wall}>
        {shown.map((t, i) => (
          <figure key={i} className={s.note} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <blockquote>{t.text}</blockquote>
            <figcaption>— {t.name ?? (anonymous ? "Anonymous" : "Someone")}</figcaption>
          </figure>
        ))}
      </div>
      {texts.length > 12 ? (
        <button type="button" className={s.votersToggle} onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${texts.length} answers`}</button>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- Funnel */
export function DropOffFunnel({ poll, dropOff }: { poll: Poll; dropOff: number[] }) {
  const mounted = useMounted();
  const n = poll.questions.length;
  const labels = ["Intro", ...poll.questions.map((_, i) => `Q${i + 1}`), "Review"];
  const rows = labels.map((label, i) => ({ label, count: dropOff[i] ?? 0, title: i >= 1 && i <= n ? poll.questions[i - 1]!.title : label }));
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((a, r) => a + r.count, 0);
  const worst = rows.reduce((w, r) => (r.count > w.count ? r : w), rows[0]!);
  return (
    <section className={cx("tp-card", s.funnel, "tp-enter")} aria-labelledby="funnel-h">
      <header className={s.qHead}>
        <span className="tp-eyebrow">Owner only</span>
        <h3 id="funnel-h" className={s.qTitle}>Where people stopped</h3>
        <span className="tp-muted tp-small">
          {total === 0 ? "Nobody has left a poll half-done. 🎉" : <>{total} unfinished {total === 1 ? "response" : "responses"} · most stopped at <b>{worst.label}</b></>}
        </span>
      </header>
      {total > 0 ? (
        <ol className={s.dist}>
          {rows.map((r) => (
            <li key={r.label} className={s.distRow} title={r.title}>
              <span className={s.funnelLabel}>{r.label}</span>
              <span className={s.track}><span className={cx(s.fill, s.fillWarm)} style={{ width: mounted ? `${(r.count / max) * 100}%` : 0 }} /></span>
              <span className={s.distNum}>{r.count}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
