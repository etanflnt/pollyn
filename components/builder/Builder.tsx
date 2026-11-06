"use client";
// Step-by-step poll builder: /create (new draft) and /polls/[id]/edit (autosaving editor). Owner: Leonardo.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Poll, PollInput, PollSettings, PollStatus, PollView } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { AppShell } from "@/components/shell/AppShell";
import { SignInCard } from "@/components/shell/SignInCard";
import { PollNav } from "@/components/shell/PollNav";
import { Button, EmptyState, Skeleton, Spinner, burstConfetti, cx, useToast } from "@/components/ui";
import { emptyDraft, fromInput, fromPoll, STEPS, toInput, validate, type Draft, type StepIndex } from "./draft";
import { findTemplate } from "./templates";
import { SaveIndicator, Stepper, type SaveState } from "./Stepper";
import { StepBasics } from "./StepBasics";
import { StepQuestions } from "./StepQuestions";
import { StepSettings } from "./StepSettings";
import { StepPublish } from "./StepPublish";
import { Icon } from "./icons";
import s from "./Builder.module.css";

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiRequestError || e instanceof Error ? e.message : "") || fallback;
const clampStep = (n: number): StepIndex => (Math.max(0, Math.min(3, Number.isFinite(n) ? n : 0)) as StepIndex);
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- Shared frame ---------------- */
function BuilderSkeleton() {
  return (
    <div className={s.wrap} aria-busy="true">
      <Skeleton height={48} radius={999} style={{ marginBottom: 24 }} />
      <div className="tp-card tp-stack" style={{ padding: 24 }}>
        <Skeleton width={120} height={12} />
        <Skeleton width="70%" height={36} />
        <Skeleton height={52} />
        <Skeleton height={96} />
        <Skeleton height={140} />
      </div>
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { user, loading, me } = useAuth();
  if (loading) return <AppShell><BuilderSkeleton /></AppShell>;
  if (!user) return <AppShell><SignInCard title="Sign in to build a poll" subtitle="Use your work account to create and share polls." /></AppShell>;
  if (!me?.canCreate) {
    return (
      <AppShell>
        <EmptyState icon="🔒" title={user.kind === "guest" ? "Guests can't create polls" : "Poll creation is limited"}>
          <p>{user.kind === "guest" ? "Sign in with your work account to create polls." : "Only admins in your organisation can create polls. You can still vote using links you receive."}</p>
          <Link href="/" className="tp-btn tp-btn-secondary">Back home</Link>
        </EmptyState>
      </AppShell>
    );
  }
  return <>{children}</>;
}

function ActionBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <div className={s.actionBar}>
      <div className={s.actionInner}>
        <div className={s.actionSide}>{left}</div>
        <div className={s.actionCenter}>{center}</div>
        <div className={cx(s.actionSide, s.actionRight)}>{right}</div>
      </div>
    </div>
  );
}

/* ---------------- /create ---------------- */
export function CreateBuilder() {
  return <Gate><CreateInner /></Gate>;
}

function CreateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const template = findTemplate(params.get("template"));
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const create = useCallback(async (input: PollInput, step: StepIndex) => {
    setBusy(true);
    try {
      const poll = await api<Poll>("/api/polls", { method: "POST", json: input });
      router.replace(`/polls/${poll.id}/edit?step=${step}${template ? "&fresh=1" : ""}`);
    } catch (e) {
      toast(errMsg(e, "Couldn't create the poll"), "error");
      setFailed(true);
      setBusy(false);
      started.current = false;
    }
  }, [router, toast, template]);

  // Templates: create the draft straight away and jump to the questions.
  useEffect(() => {
    if (!template || started.current) return;
    started.current = true;
    const input = template.build();
    setDraft(fromInput(input));
    void create(input, 1);
  }, [template, create]);

  const issues = useMemo(() => validate(draft), [draft]);
  const canContinue = !!draft.title.trim() && !issues.some((i) => i.step === 0 && i.severity === "error");
  const go = () => {
    if (!canContinue || started.current) return;
    started.current = true;
    void create(toInput(draft), 1);
  };

  if (template) {
    return (
      <AppShell>
        <div className={cx(s.wrap, s.creating)} role="status">
          <span className={s.creatingEmoji} aria-hidden>{template.emoji}</span>
          {failed ? (
            <>
              <div className="tp-h3">Couldn&apos;t set up “{template.name}”</div>
              <div className="tp-row" style={{ justifyContent: "center" }}>
                <Link href="/" className="tp-btn tp-btn-ghost">Back home</Link>
                <Button variant="primary" onClick={() => { setFailed(false); started.current = true; void create(template.build(), 1); }}>Try again</Button>
              </div>
            </>
          ) : (
            <>
              <div className="tp-h3">Setting up “{template.name}”…</div>
              <Spinner />
            </>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={s.wrap}>
        <div className={s.topRow}>
          <Link href="/" className={s.backLink}><Icon name="left" size={16} />My polls</Link>
          <span className="tp-spacer" />
          <span className="tp-hint">New draft</span>
        </div>
        <Stepper step={0} onStep={() => {}} locked={(i) => i > 0} />
        <div className={cx("tp-card", s.stage)}>
          <StepBasics draft={draft} issues={issues} autoFocus onSubmit={go} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
        </div>
        <ActionBar
          left={<Link href="/" className="tp-btn tp-btn-ghost">Cancel</Link>}
          center={<span className="tp-hint">Step 1 of 4</span>}
          right={<Button variant="primary" onClick={go} loading={busy} disabled={!canContinue}>Next: Questions<Icon name="right" size={16} /></Button>}
        />
      </div>
    </AppShell>
  );
}

/* ---------------- /polls/[id]/edit ---------------- */
export function PollEditor({ id }: { id: string }) {
  return <Gate><EditorLoader id={id} /></Gate>;
}

function EditorLoader({ id }: { id: string }) {
  const params = useSearchParams();
  const [view, setView] = useState<PollView | null>(null);
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setView(null); setErr(null);
    api<PollView>(`/api/polls/${encodeURIComponent(id)}`)
      .then((v) => { if (alive) setView(v); })
      .catch((e) => { if (alive) setErr({ code: e instanceof ApiRequestError ? e.body.code : "error", msg: errMsg(e, "Something went wrong") }); });
    return () => { alive = false; };
  }, [id]);

  if (err) {
    return (
      <AppShell>
        <EmptyState icon={err.code === "not_found" ? "🔍" : "⚠️"} title={err.code === "not_found" ? "Poll not found" : "Couldn't open this poll"}>
          <p>{err.code === "not_found" ? "It may have been deleted, or the link is wrong." : err.msg}</p>
          <Link href="/" className="tp-btn tp-btn-secondary">Back to my polls</Link>
        </EmptyState>
      </AppShell>
    );
  }
  if (!view) return <AppShell><BuilderSkeleton /></AppShell>;
  if (!view.isOwner) {
    return (
      <AppShell>
        <EmptyState icon="🔒" title="Only the creator can edit this poll">
          <p>You can still vote or see results if they're shared.</p>
          <Link href={`/p/${view.poll.slug}`} className="tp-btn tp-btn-primary">Go to the poll</Link>
        </EmptyState>
      </AppShell>
    );
  }
  return <Editor key={view.poll.id} initial={view.poll} initialStep={clampStep(Number(params.get("step") ?? 0))} fresh={params.get("fresh") === "1"} />;
}

function Editor({ initial, initialStep, fresh }: { initial: Poll; initialStep: StepIndex; fresh: boolean }) {
  const toast = useToast();
  const { user } = useAuth();
  const [poll, setPoll] = useState(initial);
  const [draft, setDraftState] = useState<Draft>(() => fromPoll(initial));
  const [step, setStep] = useState<StepIndex>(initialStep);
  const [dir, setDir] = useState<1 | -1>(1);
  const [save, setSave] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [focusQ, setFocusQ] = useState<string | undefined>(undefined);

  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const errorShown = useRef(false);

  const greeted = useRef(false);
  useEffect(() => {
    if (!fresh || greeted.current) return;
    greeted.current = true;
    toast("Template ready — tweak anything you like ✨");
  }, [fresh, toast]);

  const flush = useCallback((): Promise<void> => {
    chain.current = chain.current.then(async () => {
      if (!dirty.current) return;
      dirty.current = false;
      setSave("saving");
      try {
        const p = await api<Poll>(`/api/polls/${initial.id}`, { method: "PATCH", json: toInput(draftRef.current) });
        setPoll((old) => ({ ...old, ...p }));
        errorShown.current = false;
        setSave(dirty.current ? "pending" : "saved");
      } catch (e) {
        dirty.current = true;
        setSave("error");
        if (!errorShown.current) { toast(errMsg(e, "Autosave failed"), "error"); errorShown.current = true; }
      }
    });
    return chain.current;
  }, [initial.id, toast]);

  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraftState((d) => { const next = fn(d); draftRef.current = next; return next; });
    dirty.current = true;
    setSave("pending");
  }, []);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void flush(), 800);
    return () => clearTimeout(t);
  }, [draft, flush]);

  // Warn before leaving with unsaved changes; flush on unmount.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onBefore);
    return () => { window.removeEventListener("beforeunload", onBefore); if (dirty.current) void flush(); };
  }, [flush]);

  const issues = useMemo(() => validate(draft), [draft]);
  const issueSteps = useMemo(() => new Set(issues.filter((i) => i.severity === "error").map((i) => i.step)), [issues]);

  const goto = useCallback((next: StepIndex, focusQuestion?: string) => {
    setDir(next >= step ? 1 : -1);
    setStep(next);
    setJustPublished(false);
    void flush();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(next));
      url.searchParams.delete("fresh");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch { /* ignore */ }
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    setFocusQ(focusQuestion);
  }, [step, flush]);

  const changeStatus = useCallback(async (status: PollStatus) => {
    if (status === "open" && issues.some((i) => i.severity === "error")) { toast("Fix the checklist items first", "error"); return; }
    setBusy(true);
    try {
      await flush();
      const p = await api<Poll>(`/api/polls/${initial.id}`, { method: "PATCH", json: { ...toInput(draftRef.current), status } });
      dirty.current = false;
      setPoll((old) => ({ ...old, ...p }));
      setSave("saved");
      if (status === "open") {
        const wasDraft = poll.status === "draft";
        setJustPublished(wasDraft);
        if (wasDraft) burstConfetti(120);
        toast(wasDraft ? "Published! Share the link 🎉" : "Poll reopened");
      } else toast("Poll closed — results are final");
    } catch (e) {
      toast(errMsg(e, "Couldn't update the poll"), "error");
    } finally { setBusy(false); }
  }, [issues, flush, initial.id, poll.status, toast]);

  const setSettings = (p: Partial<PollSettings>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const stepErrors = issues.filter((i) => i.step === step && i.severity === "error").length;

  let body: ReactNode;
  if (step === 0) body = <StepBasics draft={draft} issues={issues} onSubmit={() => goto(1)} onChange={(p) => update((d) => ({ ...d, ...p }))} />;
  else if (step === 1) body = <StepQuestions questions={draft.questions} issues={issues} focusId={focusQ} onChange={(questions) => update((d) => ({ ...d, questions }))} />;
  else if (step === 2) body = <StepSettings settings={draft.settings} issues={issues} onChange={setSettings} />;
  else body = (
    <StepPublish draft={draft} issues={issues} status={poll.status} slug={poll.slug} pollId={poll.id}
      ownerName={poll.ownerName || user?.name || "You"} justPublished={justPublished} busy={busy}
      onStatus={(st) => void changeStatus(st)} onFix={(st, q) => goto(st, q)} />
  );

  const next = step < 3 ? (step + 1) as StepIndex : null;
  let right: ReactNode;
  if (next !== null) {
    right = <Button variant="primary" onClick={() => goto(next)}><span>Next<span className="hide-sm">: {STEPS[next].short}</span></span><Icon name="right" size={16} /></Button>;
  } else if (poll.status === "draft") {
    right = <Button variant="primary" onClick={() => void changeStatus("open")} loading={busy} disabled={issueSteps.size > 0}><Icon name="sparkle" size={16} />Publish</Button>;
  } else {
    right = <Link href={`/polls/${poll.id}/results`} className="tp-btn tp-btn-primary"><Icon name="chart" size={16} />Results</Link>;
  }

  return (
    <AppShell>
      <div className={s.wrap}>
        <PollNav id={poll.id} slug={poll.status === "draft" ? undefined : poll.slug} title={draft.title.trim() || "Untitled poll"} />
        <div className={s.topRow}>
          <span className={cx("tp-badge", poll.status === "open" ? "tp-badge-good" : poll.status === "closed" ? "" : "tp-badge-warn")}>
            {poll.status === "open" ? <span className="tp-dot tp-dot-live" /> : null}
            {poll.status === "draft" ? "Draft" : poll.status === "open" ? "Live" : "Closed"}
          </span>
          {poll.status === "open" ? <span className="tp-hint hide-sm">Changes go live as you edit</span> : null}
          <span className="tp-spacer" />
          <SaveIndicator state={save} onRetry={() => { dirty.current = true; void flush(); }} />
        </div>
        <Stepper step={step} onStep={(i) => goto(i)} issueSteps={issueSteps} />
        <div className={cx("tp-card", s.stage)}>
          <div key={step} className={dir > 0 ? "tp-enter-right" : "tp-enter-left"}>{body}</div>
        </div>
        <ActionBar
          left={step > 0 ? <Button variant="ghost" onClick={() => goto((step - 1) as StepIndex)}><Icon name="left" size={16} />Back</Button> : <Link href="/" className="tp-btn tp-btn-ghost"><Icon name="left" size={16} />My polls</Link>}
          center={stepErrors ? <span className={s.barIssue}><Icon name="warn" size={14} />{stepErrors} to fix</span> : <span className="tp-hint">Step {step + 1} of 4</span>}
          right={right}
        />
      </div>
    </AppShell>
  );
}
