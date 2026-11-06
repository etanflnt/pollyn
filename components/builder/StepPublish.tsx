"use client";
import Link from "next/link";
import { useState } from "react";
import type { PollStatus } from "@/lib/types";
import { Badge, Button, cx, useToast } from "@/components/ui";
import { shareUrl } from "@/components/shell/PollNav";
import { STEPS, type Draft, type Issue, type StepIndex } from "./draft";
import { VoterPreview } from "./VoterPreview";
import { Icon } from "./icons";
import s from "./Builder.module.css";

export function ShareBox({ slug, big }: { slug: string; big?: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const link = shareUrl(slug);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); toast("Link copied — paste it in your Teams chat"); setTimeout(() => setCopied(false), 1800); }
    catch { toast("Copy failed — select the link and copy it manually", "error"); }
  };
  return (
    <div className={cx(s.shareBox, big && s.shareBoxBig)}>
      <input className={s.shareInput} readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
      <Button variant="primary" onClick={copy}>{copied ? <><Icon name="check" size={16} strokeWidth={3} />Copied</> : <><Icon name="copy" size={16} />Copy</>}</Button>
    </div>
  );
}

export function StepPublish({ draft, issues, status, slug, pollId, ownerName, justPublished, busy, onStatus, onFix }: {
  draft: Draft;
  issues: Issue[];
  status: PollStatus;
  slug: string;
  pollId: string;
  ownerName: string;
  justPublished: boolean;
  busy: boolean;
  onStatus: (s: PollStatus) => void;
  onFix: (step: StepIndex, questionId?: string) => void;
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  const choiceOk = !errors.some((e) => e.id.startsWith("qo_"));
  const checks: { ok: boolean; label: string; step: StepIndex }[] = [
    { ok: !!draft.title.trim(), label: "Poll has a title", step: 0 },
    { ok: draft.questions.length > 0, label: `At least one question (${draft.questions.length})`, step: 1 },
    { ok: draft.questions.length > 0 && choiceOk, label: "Choice questions have 2+ options", step: 1 },
    { ok: !errors.some((e) => e.id.startsWith("qt_")), label: "Every question has a title", step: 1 },
  ];
  const extra = errors.filter((e) => !e.id.startsWith("qo_") && !e.id.startsWith("qt_") && e.id !== "title" && e.id !== "noq");

  return (
    <div className={s.stepBody}>
      <header className={s.stepHead}>
        <span className="tp-eyebrow">Step 4 · Preview & publish</span>
        {status === "draft" ? <h1 className="tp-h1">Looks good? <strong>Send it out.</strong></h1>
          : status === "open" ? <h1 className="tp-h1">Your poll is <strong>live</strong> 🎉</h1>
            : <h1 className="tp-h1">This poll is <strong>closed</strong></h1>}
      </header>

      <div className={s.publishGrid}>
        <div className={s.previewCol}>
          <span className="tp-label">Voter preview <span className="tp-muted">· try it</span></span>
          <VoterPreview draft={draft} ownerName={ownerName} />
        </div>

        <div className="tp-stack">
          {status === "draft" ? (
            <section className={cx("tp-card", s.publishCard)} aria-labelledby="pub-check">
              <h2 id="pub-check" className={s.groupTitle}>Ready to publish?</h2>
              <ul className={s.checklist}>
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? s.checkOk : s.checkBad}>
                    <span className={s.checkIcon} aria-hidden>{c.ok ? <Icon name="check" size={14} strokeWidth={3} /> : <Icon name="x" size={14} strokeWidth={3} />}</span>
                    <span className="tp-spacer">{c.label}<span className="sr-only">{c.ok ? " — done" : " — needs work"}</span></span>
                    {!c.ok ? <button type="button" className={s.linkBtn} onClick={() => onFix(c.step)}>Fix in {STEPS[c.step].short}</button> : null}
                  </li>
                ))}
                {extra.map((e) => (
                  <li key={e.id} className={s.checkBad}>
                    <span className={s.checkIcon} aria-hidden><Icon name="x" size={14} strokeWidth={3} /></span>
                    <span className="tp-spacer">{e.message}</span>
                    <button type="button" className={s.linkBtn} onClick={() => onFix(e.step, e.questionId)}>Fix</button>
                  </li>
                ))}
                {warns.map((w) => (
                  <li key={w.id} className={s.checkWarn}>
                    <span className={s.checkIcon} aria-hidden><Icon name="warn" size={14} /></span>
                    <span className="tp-spacer">{w.message}</span>
                  </li>
                ))}
              </ul>
              <Button variant="primary" size="lg" block loading={busy} disabled={errors.length > 0} onClick={() => onStatus("open")}>
                <Icon name="sparkle" size={18} />Publish poll
              </Button>
              <p className="tp-hint" style={{ margin: 0, textAlign: "center" }}>
                {errors.length ? `${errors.length} thing${errors.length === 1 ? "" : "s"} to fix first` : "You can still edit after publishing."}
              </p>
            </section>
          ) : (
            <section className={cx("tp-card", s.publishCard, justPublished && s.publishCelebrate)} aria-labelledby="pub-live">
              <div className="tp-row">
                <h2 id="pub-live" className={s.groupTitle} style={{ margin: 0 }}>{status === "open" ? "Share the link" : "Poll link"}</h2>
                <span className="tp-spacer" />
                {status === "open" ? <Badge tone="good" live>Live</Badge> : <Badge>Closed</Badge>}
              </div>
              <ShareBox slug={slug} big />
              <p className="tp-hint" style={{ margin: 0 }}>
                {draft.settings.access === "org" ? "Colleagues sign in with Teams to vote." : "Anyone with the link can vote — guests just enter a name."}
                {draft.settings.closesAt ? ` Closes ${new Date(draft.settings.closesAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.` : ""}
              </p>
              <div className={s.nextLinks}>
                <Link href={`/polls/${pollId}/results`} className={s.nextLink}><Icon name="chart" size={20} /><span><strong>Live results</strong><span className="tp-hint">Watch votes roll in</span></span></Link>
                <Link href={`/polls/${pollId}/games`} className={s.nextLink}><Icon name="dice" size={20} /><span><strong>Games</strong><span className="tp-hint">Spinner, raffle & more</span></span></Link>
                <a href={`/p/${slug}`} target="_blank" rel="noreferrer" className={s.nextLink}><Icon name="eye" size={20} /><span><strong>Open as voter</strong><span className="tp-hint">New tab</span></span></a>
              </div>
              {status === "open" ? (
                <Button variant="ghost" onClick={() => onStatus("closed")} loading={busy}><Icon name="stop" size={16} />Close poll now</Button>
              ) : (
                <Button onClick={() => onStatus("open")} loading={busy} disabled={errors.length > 0}><Icon name="play" size={16} />Reopen poll</Button>
              )}
              {errors.length ? <p className={s.inlineIssue}>Heads up: {errors[0]!.message.toLowerCase()} — voters may hit problems.</p> : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
