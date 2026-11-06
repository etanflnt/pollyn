"use client";
// Step-by-step voter flow: intro → one question per step → review → thank-you. Autosaves progress so
// voters resume where they stopped. Owner: Ada.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Answer, ID, Option, Poll, PollResponse, PollResults, PollView, ResponseInput, User } from "@/lib/types";
import { api, ApiRequestError, authHeaders } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { Badge, Button, MediaView, Progress, Spinner, burstConfetti, cx, useToast } from "@/components/ui";
import { ResultsBoard } from "@/components/results/ResultsBoard";
import { ChoiceInput, RatingInput, TextInput } from "./QuestionInputs";
import { clampStep, estimateLabel, isAnswered, isClosed, prefersReducedMotion, shake, summarize } from "./answers";
import s from "./vote.module.css";

type Mode = "flow" | "done";

export function VoteFlow({ initial, user }: { initial: PollView; user: User }) {
  const toast = useToast();
  const { signOut } = useAuth();
  const [view, setView] = useState(initial);
  const [poll, setPoll] = useState<Poll>(initial.poll);
  const n = poll.questions.length;
  const reviewStep = n + 1;
  const mine = initial.myResponse;

  const [answers, setAnswers] = useState<Record<ID, Answer>>(() => mine?.answers ?? {});
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"right" | "left">("right");
  const [mode, setMode] = useState<Mode>(mine?.completed ? "done" : "flow");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);          // editing an already-completed response
  const [completedOnce, setCompletedOnce] = useState(!!mine?.completed);
  const [fromReview, setFromReview] = useState(false);
  const [errorQ, setErrorQ] = useState<ID | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(() => isClosed(initial.poll));
  const [results, setResults] = useState<PollResults | null>(null);
  const [newIds, setNewIds] = useState<Set<ID>>(() => new Set());

  // Furthest-known position: the saved step on load, then wherever the voter last was.
  const [resumeStep, setResumeStep] = useState(() => (mine && !mine.completed && mine.currentStep > 0 ? clampStep(mine.currentStep, initial.poll) : 0));

  /* ---------------- persistence ---------------- */
  const answersRef = useRef(answers); answersRef.current = answers;
  const stepRef = useRef(step); stepRef.current = step;
  const startedRef = useRef(!!mine);
  const dirtyRef = useRef(false);
  const skipSaveRef = useRef(false); skipSaveRef.current = editing || mode === "done" || closed;
  const lastErrRef = useRef(0);

  const persist = useCallback(async (currentStep: number, opts?: { keepalive?: boolean }) => {
    if (skipSaveRef.current || !startedRef.current) return;
    const body: ResponseInput = { answers: answersRef.current, currentStep, completed: false };
    dirtyRef.current = false;
    const url = `/api/polls/${poll.id}/response`;
    if (opts?.keepalive) {
      try { void fetch(url, { method: "PUT", keepalive: true, credentials: "include", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify(body) }); } catch { /* best effort */ }
      return;
    }
    try { await api<PollResponse>(url, { method: "PUT", json: body }); }
    catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) { setClosed(true); toast("This poll just closed", "error"); return; }
      dirtyRef.current = true;
      if (Date.now() - lastErrRef.current > 15000) {
        lastErrRef.current = Date.now();
        toast(e instanceof ApiRequestError && e.status === 401 ? "You were signed out, so progress isn't being saved" : "Couldn't save your progress, we'll keep trying", "error");
      }
    }
  }, [poll.id, toast]);

  // Debounced save while answering.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => { if (dirtyRef.current) void persist(stepRef.current); }, 900);
    return () => clearTimeout(t);
  }, [answers, persist]);

  // Save when the tab is hidden / page is closing (keepalive so it survives unload).
  useEffect(() => {
    const flush = () => { if (startedRef.current && (dirtyRef.current || document.visibilityState === "hidden")) void persist(stepRef.current, { keepalive: true }); };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", flush); };
  }, [persist]);

  /* ---------------- navigation ---------------- */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, mode]);

  const goTo = useCallback((next: number, d: "right" | "left") => {
    setDir(d);
    setStep(next);
    setErrorQ(null);
    stepRef.current = next;
    if (next > 0) { startedRef.current = true; setResumeStep(next); }
    void persist(next);
  }, [persist]);

  const current = step >= 1 && step <= n ? poll.questions[step - 1]! : null;

  const firstMissing = useCallback(() => poll.questions.findIndex((q) => q.required && !isAnswered(q, answersRef.current[q.id])), [poll.questions]);

  const submit = useCallback(async () => {
    const miss = firstMissing();
    if (miss >= 0) {
      toast("One required question still needs an answer", "error");
      setFromReview(true); goTo(miss + 1, "left"); setErrorQ(poll.questions[miss]!.id);
      return;
    }
    setSubmitting(true);
    try {
      const body: ResponseInput = { answers: answersRef.current, currentStep: reviewStep, completed: true };
      await api<PollResponse>(`/api/polls/${poll.id}/response`, { method: "PUT", json: body });
      dirtyRef.current = false;
      setEditing(false); setFromReview(false); setCompletedOnce(true);
      setJustSubmitted(true); setMode("done");
      burstConfetti(110);
      try {
        const v = await api<PollView>(`/api/polls/${poll.id}`);
        setView(v);
        if (v.canSeeResults) setResults(await api<PollResults>(`/api/polls/${poll.id}/results`));
      } catch { /* thank-you still works without results */ }
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.status === 409) { setClosed(true); toast("Sorry, this poll closed before your vote was saved", "error"); }
        else toast(e.body.error || "Could not submit your vote", "error");
      } else toast("Network hiccup: your vote wasn't sent. Try again.", "error");
    } finally { setSubmitting(false); }
  }, [firstMissing, goTo, poll.id, poll.questions, reviewStep, toast]);

  const next = useCallback(() => {
    if (submitting) return;
    if (step === 0) { goTo(resumeStep > 0 ? resumeStep : 1, "right"); return; }
    if (step === reviewStep) { void submit(); return; }
    if (current && current.required && !isAnswered(current, answersRef.current[current.id])) {
      setErrorQ(current.id); shake(cardRef.current);
      return;
    }
    if (fromReview) { setFromReview(false); goTo(reviewStep, "right"); return; }
    goTo(step + 1, "right");
  }, [current, fromReview, goTo, resumeStep, reviewStep, step, submit, submitting]);

  const back = useCallback(() => { if (step > 0) { setFromReview(false); goTo(step - 1, "left"); } }, [goTo, step]);

  // Enter = next (when focus isn't in a field or on another control).
  const nextRef = useRef(next); nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
      if (document.querySelector(".tp-overlay")) return;
      e.preventDefault(); nextRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setAnswer = useCallback((qid: ID, a: Answer) => {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, [qid]: a }));
    setErrorQ((e) => (e === qid ? null : e));
  }, []);

  const onOptionAdded = useCallback((qid: ID, o: Option) => {
    setPoll((p) => ({ ...p, questions: p.questions.map((q) => (q.id === qid && !q.options.some((x) => x.id === o.id) ? { ...q, options: [...q.options, o] } : q)) }));
    setNewIds((prev) => new Set(prev).add(o.id));
  }, []);

  const editAnswers = () => {
    setEditing(true); setJustSubmitted(false); setMode("flow"); setDir("left"); setStep(reviewStep); stepRef.current = reviewStep;
  };

  // Results for done / closed screens.
  useEffect(() => {
    if (!(mode === "done" || closed) || !view.canSeeResults || results) return;
    let alive = true;
    api<PollResults>(`/api/polls/${poll.id}/results`).then((r) => { if (alive) setResults(r); }).catch(() => {});
    return () => { alive = false; };
  }, [mode, closed, view.canSeeResults, poll.id, results]);

  const showCount = view.participantCount != null && (poll.settings.showVoteCounts || view.isOwner);
  const countLine = showCount ? `${view.participantCount} ${view.participantCount === 1 ? "person has" : "people have"} voted` : null;
  const firstName = user.name.split(/\s+/)[0] || user.name;

  const ownerBar = view.isOwner ? (
    <div className={s.ownerBar}>
      <Badge tone="accent">You own this poll</Badge>
      {poll.status === "draft" ? <Badge tone="warn">Draft · only you can see it</Badge> : null}
      <span className="tp-spacer" />
      <Link href={`/polls/${poll.id}/results`} className="tp-small">Live results →</Link>
    </div>
  ) : null;

  /* ---------------- closed ---------------- */
  if (closed) {
    return (
      <div className="tp-stack" style={{ gap: 20 }}>
        {ownerBar}
        <div className={cx("tp-card", s.center, "tp-enter")}>
          <div className={s.bigIcon} aria-hidden>🔒</div>
          <h1 className="tp-h2" ref={headingRef} tabIndex={-1}>This poll is closed</h1>
          <p className="tp-muted" style={{ margin: 0 }}>{poll.title}</p>
          {completedOnce ? <Badge tone="good">You voted ✓</Badge> : null}
          {countLine ? <div className="tp-muted tp-small">{countLine}</div> : null}
        </div>
        <ResultsSection view={view} poll={poll} results={results} answers={answers} />
      </div>
    );
  }

  /* ---------------- done / already voted ---------------- */
  if (mode === "done") {
    return (
      <div className="tp-stack" style={{ gap: 20 }}>
        {ownerBar}
        <div className={cx("tp-card", s.center, "tp-enter")}>
          <div className={s.checkBurst} aria-hidden>
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7.5 7.5L38 19" /></svg>
          </div>
          <h1 className="tp-h2" ref={headingRef} tabIndex={-1}>{justSubmitted ? `Thanks, ${firstName}!` : "You've voted ✓"}</h1>
          <p className="tp-muted" style={{ margin: 0 }}>{justSubmitted ? "Your vote is in." : "Your answers are saved."} {poll.title}</p>
          {countLine ? <Badge tone="good">{countLine}</Badge> : null}
          <div className={s.doneActions}>
            {view.canSeeResults ? <Link href={`/polls/${poll.id}/results`} className="tp-btn tp-btn-primary">See live results</Link> : null}
            <Button variant="secondary" onClick={editAnswers}>Edit my answers</Button>
          </div>
        </div>
        <ResultsSection view={view} poll={poll} results={results} answers={answers} />
      </div>
    );
  }

  /* ---------------- intro ---------------- */
  if (step === 0) {
    return (
      <div className="tp-stack" style={{ gap: 16 }}>
        {ownerBar}
        <article className={cx("tp-card", s.intro, dir === "left" ? "tp-enter-left" : "tp-enter")}>
          {poll.cover?.url ? <MediaView media={poll.cover} className={s.cover} /> : <div className={cx(s.coverArt, s[`theme_${poll.settings.theme}`])} aria-hidden><span>🗳️</span></div>}
          <div className={s.introBody}>
            <span className="tp-eyebrow">by {poll.ownerName}</span>
            <h1 className="tp-h1" ref={headingRef} tabIndex={-1} style={{ fontWeight: 800 }}>{poll.title}</h1>
            {poll.description ? <p className={s.desc}>{poll.description}</p> : null}
            <div className={s.metaRow}>
              <span className={s.meta}>📝 {n} {n === 1 ? "question" : "questions"}</span>
              <span className={s.meta}>⏱️ {estimateLabel(poll)}</span>
              {countLine ? <span className={s.meta}>🙋 {countLine}</span> : null}
              {poll.settings.anonymous ? <span className={s.meta}>🕶️ Anonymous</span> : null}
              {poll.settings.closesAt ? <span className={s.meta}>⏳ Closes {fmtDate(poll.settings.closesAt)}</span> : null}
            </div>
            {resumeStep > 0 ? (
              <div className={s.resume}>
                <div>
                  <b>{mine ? `Welcome back, ${firstName}!` : "Pick up where you were"}</b>
                  <div className="tp-small tp-muted">You stopped at {resumeStep === reviewStep ? "the review" : `question ${resumeStep} of ${n}`}. Your answers are saved.</div>
                </div>
                <Progress value={(resumeStep - 1) / Math.max(1, n)} label="Your progress" />
              </div>
            ) : null}
            <div className={s.introActions}>
              <Button variant="primary" size="lg" onClick={next} disabled={n === 0}>
                {resumeStep > 0 ? `Continue · ${resumeStep === reviewStep ? "review" : `question ${resumeStep}`}` : "Start"} <span aria-hidden>→</span>
              </Button>
              {resumeStep > 1 ? <Button variant="ghost" onClick={() => goTo(1, "right")}>Start from question 1</Button> : null}
            </div>
            {n === 0 ? <p className="tp-muted tp-small">This poll has no questions yet.</p> : null}
            <div className="tp-hint">
              Voting as <b>{user.name}</b>{user.kind === "guest" ? " (guest)" : ""} · <button type="button" className={s.linkBtn} onClick={() => void signOut()}>not you?</button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  /* ---------------- question / review ---------------- */
  const isReview = step === reviewStep;
  const answered = current ? isAnswered(current, answers[current.id]) : false;
  const nextLabel = isReview ? (editing ? "Update my vote" : "Submit vote")
    : fromReview ? "Back to review"
    : current && !current.required && !answered ? "Skip"
    : step === n ? "Review" : "Next";

  return (
    <div className={s.flow}>
      <div className={s.flowHead}>
        <div className={s.flowHeadRow}>
          <span className={s.pollName}>{poll.title}</span>
          <span className={s.counter} aria-live="polite">{isReview ? "Review" : <><b>{step}</b> of {n}</>}</span>
        </div>
        <Progress value={isReview ? 1 : (step - 1) / n + (answered ? 1 / n : 0.5 / n)} label="Poll progress" />
      </div>

      <div key={step} ref={cardRef} className={cx("tp-card", s.stepCard, dir === "right" ? "tp-enter-right" : "tp-enter-left")}>
        {current ? (
          <>
            <div className={s.qHead}>
              <span className="tp-eyebrow">Question {step}{current.required ? " · required" : " · optional"}</span>
              <h2 id={`q-title-${current.id}`} ref={headingRef} tabIndex={-1} className={s.qTitle}>{current.title}</h2>
              {current.description ? <p className={s.desc}>{current.description}</p> : null}
            </div>
            {current.media?.url ? <MediaView media={current.media} /> : null}
            {current.type === "single" || current.type === "multiple" ? (
              <ChoiceInput question={current} answer={answers[current.id]} onChange={(a) => setAnswer(current.id, a)} onSubmitKey={next}
                labelledBy={`q-title-${current.id}`} pollId={poll.id} userId={user.id} newOptionIds={newIds} onOptionAdded={onOptionAdded} />
            ) : current.type === "rating" ? (
              <RatingInput question={current} answer={answers[current.id]} onChange={(a) => setAnswer(current.id, a)} onSubmitKey={next} labelledBy={`q-title-${current.id}`} />
            ) : (
              <TextInput question={current} answer={answers[current.id]} onChange={(a) => setAnswer(current.id, a)} onSubmitKey={next} labelledBy={`q-title-${current.id}`} />
            )}
            {errorQ === current.id ? <div role="alert" className={s.error}>This one is required. Pick an answer to continue.</div> : null}
          </>
        ) : (
          <>
            <div className={s.qHead}>
              <span className="tp-eyebrow">Almost done</span>
              <h2 ref={headingRef} tabIndex={-1} className={s.qTitle}>Review your answers</h2>
              <p className={s.desc}>Tap any answer to change it.</p>
            </div>
            <ol className={s.review}>
              {poll.questions.map((q, i) => {
                const sum = summarize(q, answers[q.id]);
                const missing = q.required && !sum;
                return (
                  <li key={q.id}>
                    <button type="button" className={cx(s.reviewItem, missing && s.reviewMissing)} onClick={() => { setFromReview(true); goTo(i + 1, "left"); }}>
                      <span className={s.reviewNum}>{i + 1}</span>
                      <span className={s.reviewText}>
                        <span className={s.reviewQ}>{q.title}</span>
                        <span className={sum ? s.reviewA : s.reviewEmpty}>{sum ?? (missing ? "Needs an answer" : "Skipped")}</span>
                      </span>
                      <span className={s.reviewEdit} aria-hidden>Edit</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      <nav className={s.nav} aria-label="Poll navigation">
        <Button variant="ghost" onClick={back} disabled={submitting}><span aria-hidden>←</span> Back</Button>
        <span className="tp-spacer" />
        <Button variant="primary" size="lg" onClick={next} loading={submitting} className={s.nextBtn}>
          {nextLabel} {isReview ? null : <span aria-hidden>→</span>}
        </Button>
      </nav>
    </div>
  );
}

function ResultsSection({ view, poll, results, answers }: { view: PollView; poll: Poll; results: PollResults | null; answers: Record<ID, Answer> }) {
  const vis = poll.settings.resultsVisibility;
  if (!view.canSeeResults) {
    return (
      <div className={cx("tp-card", s.center, s.later)}>
        <div aria-hidden style={{ fontSize: 32 }}>🔮</div>
        <div className="tp-h3">Results will be shared later</div>
        <div className="tp-muted tp-small">
          {vis === "after_close" ? "They'll appear here once the poll closes." : vis === "after_vote" ? "Finish voting to see them." : "The organiser will share the outcome."}
        </div>
      </div>
    );
  }
  if (!results) return <div className={s.center}><Spinner /></div>;
  return (
    <section className="tp-stack" aria-label="Results">
      <div className="tp-row"><h2 className="tp-h3">Results so far</h2><span className="tp-spacer" /><Link href={`/polls/${poll.id}/results`} className="tp-small">Open live view →</Link></div>
      <ResultsBoard poll={poll} results={results} isOwner={view.isOwner} showCounts={view.isOwner || poll.settings.showVoteCounts} mine={answers} compact />
    </section>
  );
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; }
}
