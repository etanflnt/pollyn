"use client";
// A realistic, interactive mini version of the voter card. Owner: Leonardo.
import { useState } from "react";
import { MediaView, Progress, pollTheme, cx } from "@/components/ui";
import { isChoice, type Draft } from "./draft";
import { Icon } from "./icons";
import s from "./Builder.module.css";

export function VoterPreview({ draft, ownerName }: { draft: Draft; ownerName: string }) {
  const [step, setStep] = useState(0); // 0 = intro, 1..n = questions
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [stars, setStars] = useState<Record<string, number>>({});
  const theme = pollTheme(draft.settings.theme);
  const qs = draft.questions;
  const n = qs.length;
  const cur = Math.min(step, n);
  const q = cur > 0 ? qs[cur - 1] : null;

  const toggle = (qid: string, oid: string, multi: boolean) =>
    setPicked((p) => {
      const now = p[qid] ?? [];
      return { ...p, [qid]: multi ? (now.includes(oid) ? now.filter((x) => x !== oid) : [...now, oid]) : [oid] };
    });

  return (
    <div className={s.phone} aria-label="Voter preview">
      <div className={s.phoneCover} style={{ background: theme.gradient, color: theme.ink }}>
        <span className={s.phoneBrand}>Pollyn · {draft.settings.access === "org" ? "Org only" : "Open link"}</span>
        <strong className={s.phoneTitle}>{draft.title.trim() || "Untitled poll"}</strong>
      </div>
      <div className={s.phoneBody}>
        {n > 0 ? <Progress value={cur / n} label="Preview progress" /> : null}
        <div key={cur} className={cx(s.phoneStep, "tp-enter-right")}>
          {!q ? (
            <>
              {draft.cover?.url ? <MediaView media={draft.cover} className={s.mediaPreviewSm} /> : null}
              {draft.description.trim() ? <p className={s.phoneDesc}>{draft.description}</p> : <p className="tp-muted tp-small">No description</p>}
              <span className="tp-hint">by {ownerName} · {n} question{n === 1 ? "" : "s"}{draft.settings.anonymous ? " · anonymous" : ""}</span>
            </>
          ) : (
            <>
              <span className="tp-eyebrow">Question {cur} of {n}{q.required ? "" : " · optional"}</span>
              <strong className={s.phoneQ}>{q.title.trim() || "Untitled question"}</strong>
              {q.description?.trim() ? <p className={s.phoneDesc}>{q.description}</p> : null}
              {q.media?.url ? <MediaView media={q.media} className={s.mediaPreviewSm} /> : null}
              {isChoice(q) ? (
                <div className={s.phoneOpts} role="group" aria-label="Preview options">
                  {q.options.filter((o) => o.label.trim()).map((o) => {
                    const on = (picked[q.id] ?? []).includes(o.id);
                    return (
                      <button key={o.id} type="button" className={cx("tp-choice", s.phoneChoice)} aria-pressed={on} onClick={() => toggle(q.id, o.id, q.type === "multiple")}>
                        <span className={cx("tp-choice-mark", q.type === "multiple" && "square")}>{on ? <Icon name="check" size={12} strokeWidth={3.5} /> : null}</span>
                        {o.media?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.media.url} alt="" className={s.phoneOptImg} />
                        ) : null}
                        <span>{o.label}</span>
                      </button>
                    );
                  })}
                  {q.allowSuggestions ? <span className={s.phoneSuggest}>💡 Suggest an option</span> : null}
                </div>
              ) : q.type === "rating" ? (
                <div className={s.phoneStars} role="group" aria-label="Preview rating">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} type="button" aria-label={`${v} star${v > 1 ? "s" : ""}`} aria-pressed={(stars[q.id] ?? 0) >= v}
                      onClick={() => setStars((p) => ({ ...p, [q.id]: v }))}><Icon name="star" size={26} /></button>
                  ))}
                </div>
              ) : (
                <div className={s.fakeText}>Type your answer…</div>
              )}
            </>
          )}
        </div>
        <div className={s.phoneNav}>
          <button type="button" className={s.iconBtn} onClick={() => setStep(Math.max(0, cur - 1))} disabled={cur === 0} aria-label="Previous preview step"><Icon name="left" size={18} /></button>
          <span className="tp-hint">{cur === 0 ? "Intro" : `${cur}/${n}`}</span>
          <button type="button" className={cx("tp-btn tp-btn-primary tp-btn-sm", s.phoneNext)} onClick={() => setStep(Math.min(n, cur + 1))} disabled={cur >= n}>
            {cur === 0 ? "Start" : "Next"}<Icon name="right" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
