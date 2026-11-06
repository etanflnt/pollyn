"use client";
// Home: hero, quick-start templates and "my polls" grid. Owner: Leonardo.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PollSummary } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { AppShell } from "@/components/shell/AppShell";
import { SignInCard } from "@/components/shell/SignInCard";
import { Button, Card, EmptyState, Modal, Segmented, Skeleton, cx, useToast } from "@/components/ui";
import { TEMPLATES } from "@/components/builder/templates";
import { Icon } from "@/components/builder/icons";
import { PollCard } from "./PollCard";
import s from "./Dashboard.module.css";

type Filter = "all" | "open" | "draft" | "closed";
const errMsg = (e: unknown, f: string) => (e instanceof ApiRequestError || e instanceof Error ? e.message : "") || f;

function GridSkeleton({ n = 3 }: { n?: number }) {
  return (
    <div className={s.grid} aria-busy="true" aria-label="Loading polls">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cx("tp-card", s.skelCard)}>
          <Skeleton width={70} height={20} radius={999} />
          <Skeleton width="80%" height={22} />
          <Skeleton width="50%" height={14} />
          <Skeleton height={6} radius={999} />
          <Skeleton width="60%" height={32} radius={999} />
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className={s.page}>
      <div className={s.hero}>
        <div className={s.heroText}>
          <Skeleton width={140} height={12} />
          <Skeleton width="85%" height={44} />
          <Skeleton width="60%" height={18} />
          <Skeleton width={160} height={52} radius={999} />
        </div>
      </div>
      <GridSkeleton />
    </div>
  );
}

const FEATURES = [
  { icon: "🗳️", title: "Step-by-step voting", body: "One question at a time, and people pick up where they left off." },
  { icon: "💡", title: "Suggestions", body: "Voters can add their own options to the mix." },
  { icon: "🎡", title: "Randomiser games", body: "Spin the wheel or run a raffle for the voters." },
];

export function Dashboard() {
  const { user, me, loading, signOut } = useAuth();

  if (loading) return <AppShell><PageSkeleton /></AppShell>;

  if (!user) {
    return (
      <AppShell>
        <div className={s.signedOut}>
          <div className={s.signedOutHead}>
            <span className="tp-eyebrow">Polls for your team</span>
            <h1 className="tp-h1">Get <strong className="tp-gradient-text">everyone&apos;s</strong> vote.</h1>
          </div>
          <SignInCard title="Sign in to Pollyn" subtitle="Use your work account to create and manage polls." />
          <ul className={s.features}>
            {FEATURES.map((f) => <li key={f.title}><span aria-hidden>{f.icon}</span><div><strong>{f.title}</strong><span className="tp-hint">{f.body}</span></div></li>)}
          </ul>
        </div>
      </AppShell>
    );
  }

  if (user.kind === "guest") {
    return (
      <AppShell wide={false}>
        <Card className={cx("tp-enter", s.guest)}>
          <div className={s.guestEmoji} aria-hidden>👋</div>
          <h1 className="tp-h2">Hi {user.name.split(" ")[0]}!</h1>
          <p className="tp-muted">You&apos;re signed in as a <strong>guest</strong>. Guests can vote on public polls through the share link they were given, but creating polls needs a work account.</p>
          <div className="tp-row" style={{ justifyContent: "center" }}>
            <Button variant="primary" onClick={() => void signOut()}>Sign out &amp; use a work account</Button>
          </div>
          <p className="tp-hint" style={{ margin: 0 }}>Have a poll link? Just open it again — your progress is saved.</p>
        </Card>
      </AppShell>
    );
  }

  return <Home canCreate={!!me?.canCreate} firstName={user.name.split(" ")[0] ?? ""} />;
}

function Home({ canCreate, firstName }: { canCreate: boolean; firstName: string }) {
  const toast = useToast();
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [toDelete, setToDelete] = useState<PollSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try { setPolls(await api<PollSummary[]>("/api/polls")); setLoadError(null); }
    catch (e) { setLoadError(errMsg(e, "Couldn't load your polls")); setPolls((p) => p ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const duplicate = async (p: PollSummary) => {
    try {
      await api(`/api/polls/${p.id}/duplicate`, { method: "POST" });
      toast(`Copied “${p.title || "Untitled poll"}” as a new draft`);
      await load();
    } catch (e) { toast(errMsg(e, "Couldn't duplicate"), "error"); }
  };
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/api/polls/${toDelete.id}`, { method: "DELETE" });
      setPolls((ps) => ps?.filter((x) => x.id !== toDelete.id) ?? null);
      toast("Poll deleted");
      setToDelete(null);
    } catch (e) { toast(errMsg(e, "Couldn't delete"), "error"); }
    finally { setDeleting(false); }
  };

  const counts = useMemo(() => {
    const c = { all: 0, open: 0, draft: 0, closed: 0, votes: 0 };
    for (const p of polls ?? []) { c.all++; c[p.status]++; c.votes += p.completed; }
    return c;
  }, [polls]);
  const shown = (polls ?? []).filter((p) => filter === "all" || p.status === filter);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <AppShell>
      <div className={s.page}>
        <section className={cx(s.hero, "tp-enter")}>
          <div className={s.heroText}>
            <span className="tp-eyebrow">{greet}{firstName ? `, ${firstName}` : ""}</span>
            <h1 className="tp-h1">Get <strong className="tp-gradient-text">everyone&apos;s</strong> vote.</h1>
            <p className={s.lede}>Lunch runs, event dates or the serious stuff. Build a poll in a minute, share it in Teams, then spin the wheel.</p>
            {canCreate ? (
              <div className="tp-row">
                <Link href="/create" className="tp-btn tp-btn-primary tp-btn-lg"><Icon name="plus" size={18} />New poll</Link>
                {counts.all ? <span className={s.heroStats}><strong>{counts.open}</strong> live · <strong>{counts.votes}</strong> {counts.votes === 1 ? "vote" : "votes"} in</span> : null}
              </div>
            ) : (
              <div className={s.noCreate} role="note">
                <Icon name="lock" size={18} />
                <span>Creating polls is limited to admins in your organisation. You can still vote on any poll link you receive.</span>
              </div>
            )}
          </div>
          <div className={s.heroArt} aria-hidden>
            <div className={s.artCard}>
              <span className={s.artTitle}>Friday lunch?</span>
              {[["🍜 Ramen", 72], ["🍕 Pizza", 48], ["🌮 Tacos", 30]].map(([l, w]) => (
                <span key={l} className={s.artBar}><span style={{ width: `${w}%` }} /><em>{l}</em></span>
              ))}
            </div>
            <div className={s.artWheel} />
          </div>
        </section>

        {canCreate ? (
          <section aria-labelledby="tpl-title" className={s.section}>
            <div className={s.sectionHead}><h2 id="tpl-title" className={s.sectionTitle}>Start from a template</h2></div>
            <div className={s.templates}>
              {TEMPLATES.map((t, i) => (
                <Link key={t.key} href={`/create?template=${t.key}`} className={s.template} style={{ animationDelay: `${i * 50}ms` }}>
                  <span className={s.templateEmoji} aria-hidden>{t.emoji}</span>
                  <span className={s.templateText}><strong>{t.name}</strong><span className="tp-hint">{t.blurb}</span></span>
                  <span className={s.templateGo} aria-hidden><Icon name="right" size={16} /></span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="mine-title" className={s.section}>
          <div className={s.sectionHead}>
            <h2 id="mine-title" className={s.sectionTitle}>My polls{counts.all ? <span className={s.count}>{counts.all}</span> : null}</h2>
            <span className="tp-spacer" />
            {counts.all > 0 ? (
              <Segmented<Filter> ariaLabel="Filter polls" value={filter} onChange={setFilter} options={[
                { value: "all", label: "All" },
                { value: "open", label: `Live${counts.open ? ` ${counts.open}` : ""}` },
                { value: "draft", label: `Drafts${counts.draft ? ` ${counts.draft}` : ""}` },
                { value: "closed", label: "Closed" },
              ]} />
            ) : null}
          </div>

          {loadError ? (
            <div className={s.loadError} role="alert">
              <span>{loadError}</span>
              <Button size="sm" onClick={() => { setPolls(null); void load(); }}>Try again</Button>
            </div>
          ) : null}

          {polls === null ? <GridSkeleton /> : polls.length === 0 && !loadError ? (
            <EmptyState icon="🗳️" title="No polls yet">
              <p>{canCreate ? "Create your first poll or pick a template above — it takes about a minute." : "Polls you create will show up here."}</p>
              {canCreate ? <Link href="/create" className="tp-btn tp-btn-primary"><Icon name="plus" size={16} />Create a poll</Link> : null}
            </EmptyState>
          ) : shown.length === 0 && polls.length > 0 ? (
            <div className={s.filterEmpty}>Nothing here. <button type="button" className={s.linkBtn} onClick={() => setFilter("all")}>Show all polls</button></div>
          ) : (
            <div className={s.grid}>
              {shown.map((p, i) => (
                <PollCard key={p.id} poll={p} index={i} onDuplicate={() => void duplicate(p)} onDelete={() => setToDelete(p)} />
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal open={!!toDelete} onClose={() => !deleting && setToDelete(null)} title="Delete this poll?"
        footer={<>
          <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={() => void confirmDelete()} loading={deleting}><Icon name="trash" size={16} />Delete poll</Button>
        </>}>
        <p style={{ margin: 0 }}>
          <strong>“{toDelete?.title || "Untitled poll"}”</strong> and all of its {toDelete?.started ? <strong>{toDelete.started} responses</strong> : "responses"} and game draws will be permanently removed. This can&apos;t be undone.
        </p>
      </Modal>
    </AppShell>
  );
}
