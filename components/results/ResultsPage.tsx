"use client";
// /polls/[id]/results: live results for the owner (and voters when allowed). Polls every 4s while visible. Owner: Ada.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PollResults, PollView } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { PollNav, shareUrl } from "@/components/shell/PollNav";
import { SignInCard } from "@/components/shell/SignInCard";
import { Badge, Button, Card, EmptyState, Spinner, useToast } from "@/components/ui";
import { isClosed } from "@/components/vote/answers";
import { DropOffFunnel, ResultsBoard } from "./ResultsBoard";
import s from "./results.module.css";

const REFRESH_MS = 4000;
type Err = { status: number; message: string; code?: string } | null;

export function ResultsPage({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<PollView | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [stale, setStale] = useState(false);
  const [visible, setVisible] = useState(true);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const v = await api<PollView>(`/api/polls/${encodeURIComponent(id)}`);
      setView(v);
      if (!v.canSeeResults) { setErr(null); return; }
      const r = await api<PollResults>(`/api/polls/${v.poll.id}/results`);
      setResults(r); setErr(null); setStale(false);
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.status === 401 || e.status === 403 || e.status === 404) setErr({ status: e.status, message: e.body.error, code: e.body.code });
        else setStale(true);
      } else setStale(true);
    } finally { inflight.current = false; }
  }, [id]);

  const closed = view ? isClosed(view.poll) : false;

  // Initial + re-load on account change.
  useEffect(() => { if (!loading) void load(); }, [loading, user?.id, load]);

  // Live refresh while the tab is visible (stop once the poll is closed).
  useEffect(() => {
    if (loading || closed || err) return;
    const onVis = () => {
      const v = document.visibilityState === "visible";
      setVisible(v);
      if (v) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [loading, closed, err, load]);

  if (loading || (!view && !err)) return <div style={{ display: "grid", placeItems: "center", minHeight: "40vh" }}><Spinner size={32} /></div>;

  if (err?.status === 401) return <SignInCard allowGuest title="Sign in to see results" subtitle="Results are only visible to people who can access the poll." />;
  if (err?.status === 404) {
    return (
      <EmptyState icon="🧭" title="Poll not found">
        <p style={{ margin: "0 0 16px" }}>It may have been deleted, or it's still a draft.</p>
        <Link href="/" className="tp-btn tp-btn-secondary">Go home</Link>
      </EmptyState>
    );
  }
  if (err?.status === 403) {
    return (
      <EmptyState icon="🔒" title={err.code === "wrong_tenant" ? "This poll belongs to another organisation" : "Results aren't available to you"}>
        <p>{err.message}</p>
      </EmptyState>
    );
  }
  if (!view) return null;

  const { poll, isOwner } = view;
  const showCounts = isOwner || poll.settings.showVoteCounts;

  const header = isOwner ? (
    <PollNav id={poll.id} slug={poll.slug} title={poll.title} />
  ) : (
    <div className={s.voterHead}>
      <span className="tp-eyebrow">Results · by {poll.ownerName}</span>
      <h1 className="tp-h2">{poll.title}</h1>
    </div>
  );

  if (!view.canSeeResults) {
    const vis = poll.settings.resultsVisibility;
    return (
      <>
        {header}
        <EmptyState icon="🔮" title="Results aren't visible yet">
          <p style={{ margin: "0 0 16px" }}>{vis === "after_vote" ? "Vote first and the results unlock." : vis === "after_close" ? "They'll be revealed when the poll closes." : "The organiser will share the outcome."}</p>
          {!closed ? <Link href={`/p/${poll.slug}`} className="tp-btn tp-btn-primary">Go to the poll</Link> : null}
        </EmptyState>
      </>
    );
  }

  const status = closed ? <Badge tone="warn">Final results</Badge>
    : stale ? <Badge tone="danger">Reconnecting…</Badge>
    : visible ? <Badge tone="good" live>Live</Badge>
    : <Badge>Paused</Badge>;

  const empty = results && results.completed === 0 && results.started === 0 && results.questions.every((q) => q.answered === 0);
  const rate = results && results.started > 0 ? Math.round((results.completed / results.started) * 100) : 0;

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl(poll.slug)); toast("Share link copied"); } catch { toast(shareUrl(poll.slug)); }
  };

  return (
    <>
      {header}
      <div className={s.toolbar}>
        {status}
        {poll.status === "draft" ? <Badge tone="warn">Draft</Badge> : null}
        {results ? <span className="tp-muted tp-small">Updated {new Date(results.generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}
        <span className="tp-spacer" />
        {!isOwner && !closed ? <Link href={`/p/${poll.slug}`} className="tp-small">← Back to poll</Link> : null}
      </div>

      {!results ? <div style={{ display: "grid", placeItems: "center", minHeight: "30vh" }}><Spinner size={32} /></div>
        : empty ? (
          <Card className="tp-enter">
            <EmptyState icon="📭" title="No votes yet">
              <p style={{ margin: 0 }}>{isOwner ? "Share the link and watch the bars move in real time." : "Be the first to vote!"}</p>
              {isOwner ? (
                <div className={s.shareRow}>
                  <input className="tp-input" readOnly value={shareUrl(poll.slug)} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="primary" onClick={copy}>Copy</Button>
                </div>
              ) : <Link href={`/p/${poll.slug}`} className="tp-btn tp-btn-primary" style={{ marginTop: 12 }}>Vote now</Link>}
            </EmptyState>
          </Card>
        ) : (
          <>
            {showCounts && (isOwner || results.started > 0) ? (
              <div className={s.tiles}>
                <Card className={s.tile}><span className="tp-eyebrow">Started</span><span className={s.tileNum}>{results.started}</span></Card>
                <Card className={s.tile}><span className="tp-eyebrow">Completed</span><span className={s.tileNum}>{results.completed}</span></Card>
                <Card className={s.tile}><span className="tp-eyebrow">Completion</span><span className={`${s.tileNum} ${s.tileRate}`}>{rate}%</span></Card>
              </div>
            ) : null}
            <div className={isOwner && results.dropOff ? s.layout : undefined}>
              <ResultsBoard poll={poll} results={results} isOwner={isOwner} showCounts={showCounts} mine={view.myResponse?.answers} />
              {isOwner && results.dropOff ? (
                <aside className={s.side}>
                  <DropOffFunnel poll={poll} dropOff={results.dropOff} />
                </aside>
              ) : null}
            </div>
          </>
        )}
    </>
  );
}
