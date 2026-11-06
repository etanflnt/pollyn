"use client";
// Access gate for /p/[slug]: loads the PollView and handles sign-in, wrong tenant, not found. Owner: Ada.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PollView } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { SignInCard } from "@/components/shell/SignInCard";
import { Button, EmptyState } from "@/components/ui";
import { VoteFlow } from "./VoteFlow";
import s from "./vote.module.css";

type State =
  | { kind: "loading" }
  | { kind: "ok"; view: PollView }
  | { kind: "auth" }
  | { kind: "tenant"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

export function VoterApp({ slug }: { slug: string }) {
  const { user, loading, signOut } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((x) => x + 1), []);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    setState({ kind: "loading" });
    api<PollView>(`/api/polls/${encodeURIComponent(slug)}`)
      .then((view) => { if (alive) setState({ kind: "ok", view }); })
      .catch((e: unknown) => {
        if (!alive) return;
        if (!(e instanceof ApiRequestError)) { setState({ kind: "error", message: "We couldn't reach the server. Check your connection and try again." }); return; }
        if (e.status === 401) setState({ kind: "auth" });
        else if (e.status === 403 && e.body.code === "wrong_tenant") setState({ kind: "tenant", message: e.body.error });
        else if (e.status === 403) setState({ kind: "forbidden", message: e.body.error });
        else if (e.status === 404) setState({ kind: "notfound" });
        else setState({ kind: "error", message: e.body.error || "Something went wrong loading this poll." });
      });
    return () => { alive = false; };
  }, [slug, user?.id, loading, nonce]);

  if (state.kind === "loading") return <LoadingSkeleton />;

  if (state.kind === "auth" || (state.kind === "ok" && !user)) {
    // We can't know a poll's access before signing in, so offer guest entry, unless they're already a guest
    // (then this poll must be org-only and they need their work account).
    const guest = user?.kind === "guest";
    return (
      <SignInCard
        allowGuest={!guest}
        title={guest ? "This poll is for org members" : "Sign in to vote"}
        subtitle={guest ? "Guests can't vote on this one. Sign in with your work account." : "Use your work account, or join as a guest if the poll is open to everyone."}
      />
    );
  }

  if (state.kind === "tenant") {
    if (user?.kind === "guest") {
      return (
        <div className="tp-card tp-enter" style={{ maxWidth: 480, margin: "8vh auto 0" }}>
          <EmptyState icon="🔒" title="This poll is for org members only">
            <p style={{ margin: "0 0 16px" }}>
              You joined as a guest (<b>{user.name}</b>). Guests can't vote on this one. Sign in with your work account to take part.
            </p>
            <Button variant="primary" onClick={() => void signOut()}>Sign in with a work account</Button>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="tp-card tp-enter" style={{ maxWidth: 480, margin: "8vh auto 0" }}>
        <EmptyState icon="🏢" title="This poll is only for members of another organisation">
          <p style={{ margin: "0 0 16px" }}>
            You're signed in as <b>{user?.name}</b>{user?.email ? ` (${user.email})` : ""}. {state.message && !/tenant/i.test(state.message) ? state.message : "Ask the organiser for access, or switch to the right work account."}
          </p>
          <Button variant="primary" onClick={() => void signOut()}>Switch account</Button>
        </EmptyState>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <EmptyState icon="🚫" title="You can't open this poll">
        <p>{state.message}</p>
        <Button onClick={() => void signOut()}>Switch account</Button>
      </EmptyState>
    );
  }

  if (state.kind === "notfound") {
    return (
      <EmptyState icon="🧭" title="Poll not found">
        <p style={{ margin: "0 0 16px" }}>The link may be mistyped, or the poll was deleted or isn't published yet.</p>
        <Link href="/" className="tp-btn tp-btn-secondary">Go home</Link>
      </EmptyState>
    );
  }

  if (state.kind === "error") {
    return (
      <EmptyState icon="📡" title="Couldn't load the poll">
        <p style={{ margin: "0 0 16px" }}>{state.message}</p>
        <Button variant="primary" onClick={retry}>Try again</Button>
      </EmptyState>
    );
  }

  return <VoteFlow key={`${state.view.poll.id}:${user!.id}`} initial={state.view} user={user!} />;
}

function LoadingSkeleton() {
  return (
    <div className="tp-card" style={{ padding: 0, overflow: "hidden" }} aria-busy="true" aria-label="Loading poll">
      <div className="tp-skeleton" style={{ height: 132, borderRadius: 0 }} />
      <div className={s.introBody}>
        <div className="tp-skeleton" style={{ height: 14, width: 120 }} />
        <div className="tp-skeleton" style={{ height: 36, width: "80%" }} />
        <div className="tp-skeleton" style={{ height: 16, width: "95%" }} />
        <div className="tp-skeleton" style={{ height: 52, width: "100%", borderRadius: 999 }} />
      </div>
    </div>
  );
}
