"use client";
// Randomiser arcade (owner only): entry source → game → server draw → animated reveal → history. Owner: Woz.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Draw, DrawInput, Entry, EntrySource, GameKind, PollResults, PollView } from "@/lib/types";
import { api, ApiRequestError } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { AppShell } from "@/components/shell/AppShell";
import { PollNav, shareUrl } from "@/components/shell/PollNav";
import { SignInCard } from "@/components/shell/SignInCard";
import { Button, Card, EmptyState, Segmented, Spinner, burstConfetti, useToast } from "@/components/ui";
import { DrawHistory } from "./DrawHistory";
import { EntryBoard } from "./EntryBoard";
import { EntrySourcePanel } from "./EntrySourcePanel";
import { GameIcon, ShieldIcon, SoundIcon } from "./icons";
import { createSfx, drawSummary, GAME_META, MAX_ENTRIES, MAX_WINNERS, parseCustomList, type GameRun, type GameStageProps, type Sfx, useReducedMotion } from "./lib";
import { RaffleDraw } from "./RaffleDraw";
import { SpinnerWheel } from "./SpinnerWheel";
import { WinnerModal } from "./WinnerModal";
import s from "./GamesArcade.module.css";

type LoadState = "loading" | "ready" | "forbidden" | "notfound" | "unauth" | "error";

const errText = (e: unknown) => (e instanceof ApiRequestError ? e.body.error : e instanceof Error ? e.message : "Something went wrong");

export function GamesArcade({ pollId }: { pollId: string }) {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const reduced = useReducedMotion();

  const [state, setState] = useState<LoadState>("loading");
  const [view, setView] = useState<PollView | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [drawsLoading, setDrawsLoading] = useState(true);

  const [game, setGame] = useState<GameKind>("spinner");
  const [source, setSource] = useState<EntrySource>("participants");
  const [bonus, setBonus] = useState(false);
  const [questionId, setQuestionId] = useState("");
  const [customText, setCustomText] = useState("");
  const [winnersWanted, setWinnersWanted] = useState(1);

  const [draw, setDraw] = useState<Draw | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [run, setRun] = useState<GameRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [sound, setSound] = useState(false);
  const [announce, setAnnounce] = useState("");
  const sfxRef = useRef<Sfx | null>(null);
  const sfx = () => (sfxRef.current ??= createSfx());

  /* ---------- load ---------- */
  const loadResults = useCallback(async () => {
    try { setResults(await api<PollResults>(`/api/polls/${pollId}/results`)); } catch { /* preview only; draw is authoritative */ }
  }, [pollId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState("unauth"); return; }
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const v = await api<PollView>(`/api/polls/${pollId}`);
        if (!alive) return;
        setView(v);
        if (!v.isOwner) { setState("forbidden"); return; }
        setState("ready");
        void loadResults();
        try { const d = await api<Draw[]>(`/api/polls/${pollId}/draws`); if (alive) setDraws(d); }
        catch (e) { if (alive) toast(`Couldn't load past draws: ${errText(e)}`, "error"); }
        finally { if (alive) setDrawsLoading(false); }
      } catch (e) {
        if (!alive) return;
        const st = e instanceof ApiRequestError ? e.status : 0;
        setState(st === 401 ? "unauth" : st === 403 ? "forbidden" : st === 404 ? "notfound" : "error");
      }
    })();
    return () => { alive = false; };
  }, [pollId, user, authLoading, loadResults, toast]);

  // keep vote counts fresh while idle (cheap; preview only)
  const idleRef = useRef(true);
  idleRef.current = !run && !busy;
  useEffect(() => {
    if (state !== "ready") return;
    const t = window.setInterval(() => { if (idleRef.current && document.visibilityState === "visible") void loadResults(); }, 15000);
    return () => clearInterval(t);
  }, [state, loadResults]);

  useEffect(() => {
    try { setSound(localStorage.getItem("tp-games-sound") === "on"); } catch { /* ignore */ }
  }, []);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    if (next) sfx().unlock();
    try { localStorage.setItem("tp-games-sound", next ? "on" : "off"); } catch { /* ignore */ }
  };

  /* ---------- entries ---------- */
  const poll = view?.poll ?? null;
  const choiceQuestions = useMemo(
    () => (poll?.questions ?? []).filter((q) => (q.type === "single" || q.type === "multiple") && q.options.length > 0),
    [poll],
  );
  useEffect(() => {
    if (choiceQuestions.length && !choiceQuestions.some((q) => q.id === questionId)) setQuestionId(choiceQuestions[0]!.id);
  }, [choiceQuestions, questionId]);

  const custom = useMemo(() => parseCustomList(customText), [customText]);
  const completed = results?.completed ?? view?.participantCount ?? 0;

  const preview = useMemo<{ entries: Entry[]; placeholder: boolean }>(() => {
    if (source === "custom") return { entries: custom.entries, placeholder: false };
    if (source === "options") {
      const q = choiceQuestions.find((x) => x.id === questionId);
      if (!q) return { entries: [], placeholder: false };
      const qr = results?.questions.find((x) => x.questionId === q.id);
      return {
        entries: q.options.map((o) => ({ label: o.label, weight: Math.max(1, qr?.options.find((r) => r.optionId === o.id)?.count ?? 0) })),
        placeholder: false,
      };
    }
    const n = Math.min(MAX_ENTRIES, completed);
    return { entries: Array.from({ length: n }, (_, i) => ({ label: `Voter ${i + 1}`, weight: 1 })), placeholder: true };
  }, [source, custom, choiceQuestions, questionId, results, completed]);

  // any change to the setup discards the current draw (its reveal is over or abandoned)
  useEffect(() => {
    setDraw(null); setRevealed(0); setRun(null); setModal(false);
  }, [game, source, bonus, questionId, customText, winnersWanted]);

  const shown = draw ? { entries: draw.entries, placeholder: false } : preview;
  const entryCount = shown.entries.length;
  const maxWinners = Math.max(1, Math.min(MAX_WINNERS, entryCount || MAX_WINNERS));
  useEffect(() => { if (winnersWanted > maxWinners && !draw) setWinnersWanted(maxWinners); }, [maxWinners, winnersWanted, draw]);

  const pending = !!draw && revealed < draw.winners.length;
  const animating = run !== null;
  const locked = busy || animating || pending;
  const canPlay = !busy && !animating && (pending || entryCount > 0);
  const meta = GAME_META[game];
  const playLabel = pending ? `${meta.next} (${revealed + 1}/${draw!.winners.length})` : draw ? "Play again" : meta.verb;

  /* ---------- play ---------- */
  const play = async () => {
    if (!canPlay) return;
    if (sound) sfx().unlock(); // must happen inside the user gesture
    setModal(false);
    if (pending && draw) {
      setAnnounce(`Drawing winner ${revealed + 1} of ${draw.winners.length}…`);
      setRun({ key: Date.now(), winner: draw.winners[revealed]! });
      return;
    }
    const body: DrawInput = {
      game,
      source,
      winners: Math.min(winnersWanted, Math.max(1, entryCount)),
      ...(source === "options" ? { questionId } : {}),
      ...(source === "custom" ? { entries: custom.entries } : {}),
      ...(source === "participants" ? { bonusForSuggestions: bonus } : {}),
    };
    setBusy(true);
    setAnnounce("Drawing…");
    try {
      const d = await api<Draw>(`/api/polls/${pollId}/draws`, { method: "POST", json: body });
      if (!d.winners.length || !d.entries.length) { toast("There were no entries to draw from.", "error"); setAnnounce(""); return; }
      setDraws((h) => [d, ...h.filter((x) => x.id !== d.id)]);
      setDraw(d);
      setRevealed(0);
      setRun({ key: Date.now(), winner: d.winners[0]! });
    } catch (e) {
      setAnnounce("");
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const onLanded = useCallback(() => {
    const d = drawRef.current;
    const r = revealedRef.current;
    setRun(null);
    setRevealed(r + 1);
    if (d) {
      const label = d.entries[d.winners[r]!]?.label ?? "";
      setAnnounce(d.winners.length > 1 ? `Winner ${r + 1} of ${d.winners.length}: ${label}` : `The winner is ${label}`);
    }
    setModal(true);
    burstConfetti(confettiCount());
    if (sound) sfx().win();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound]);
  const onTick = useCallback(() => { if (sound) sfx().tick(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sound]);

  const revealAll = () => {
    if (!draw || animating) return;
    setRevealed(draw.winners.length);
    setAnnounce(`Winners: ${draw.winners.map((w) => draw.entries[w]?.label ?? "?").join(", ")}`);
    setModal(true);
    burstConfetti(confettiCount());
  };

  const copy = async (d: Draw, upTo?: number) => {
    const text = drawSummary(d, poll?.title, upTo);
    try { await navigator.clipboard.writeText(text); toast("Results copied"); }
    catch { toast("Couldn't access the clipboard", "error"); }
  };
  const copyShare = async () => {
    if (!poll) return;
    try { await navigator.clipboard.writeText(shareUrl(poll.slug)); toast("Share link copied"); }
    catch { toast(shareUrl(poll.slug)); }
  };

  /* ---------- states ---------- */
  if (authLoading || state === "loading") {
    return <AppShell><div className="tp-row" style={{ justifyContent: "center", padding: 64 }}><Spinner size={28} /></div></AppShell>;
  }
  if (state === "unauth") {
    return <AppShell wide={false}><SignInCard title="Sign in to run the games" subtitle="The randomiser arcade is for the poll owner." /></AppShell>;
  }
  if (state === "forbidden" || state === "notfound" || state === "error" || !poll) {
    const copyMap = {
      forbidden: { icon: "🔒", title: "Only the poll owner can run games", body: "Ask the person who created this poll to spin the wheel — or create your own poll and run the show." },
      notfound: { icon: "🔎", title: "Poll not found", body: "It may have been deleted, or the link is wrong." },
      error: { icon: "⚠", title: "Something went wrong", body: "We couldn't load this poll. Try again in a moment." },
      ready: { icon: "⚠", title: "Something went wrong", body: "" },
      loading: { icon: "", title: "", body: "" },
      unauth: { icon: "", title: "", body: "" },
    }[state];
    return (
      <AppShell wide={false}>
        <Card>
          <EmptyState icon={copyMap.icon} title={copyMap.title}>
            <p style={{ margin: "0 0 16px" }}>{copyMap.body}</p>
            <div className="tp-row" style={{ justifyContent: "center" }}>
              {state === "forbidden" && poll ? <Link href={`/p/${poll.slug}`} className="tp-btn tp-btn-secondary">Open the poll</Link> : null}
              <Link href="/" className="tp-btn tp-btn-primary">Go to my polls</Link>
            </div>
          </EmptyState>
        </Card>
      </AppShell>
    );
  }

  /* ---------- stage ---------- */
  const revealedList = draw ? draw.winners.slice(0, revealed) : [];
  const current = !animating && revealed > 0 && draw ? draw.winners[revealed - 1]! : null;
  const previous = current !== null ? revealedList.slice(0, -1) : revealedList;
  const stageProps: GameStageProps = {
    entries: shown.entries,
    placeholder: shown.placeholder,
    run,
    current,
    previous,
    revealed: revealedList,
    reduced,
    onTick,
    onLanded,
    onPlay: () => void play(),
    canPlay,
    playLabel,
  };

  const empty = entryCount === 0 && !draw;
  let emptyState: React.ReactNode = null;
  if (empty) {
    if (source === "participants") {
      emptyState = (
        <EmptyState icon="🎟" title="No voters yet">
          <p style={{ margin: "0 0 16px" }}>Every completed response becomes a ticket. Share the poll to fill the drum — or play with a custom list right now.</p>
          <div className="tp-row" style={{ justifyContent: "center" }}>
            <Button variant="primary" onClick={() => void copyShare()}>Copy share link</Button>
            <Button onClick={() => setSource("custom")}>Use a custom list</Button>
          </div>
        </EmptyState>
      );
    } else if (source === "options") {
      emptyState = (
        <EmptyState icon="🗳" title="No options to draw from">
          <p style={{ margin: "0 0 16px" }}>Add a single or multiple choice question to the poll, or type your own list.</p>
          <div className="tp-row" style={{ justifyContent: "center" }}>
            <Link href={`/polls/${poll.id}/edit`} className="tp-btn tp-btn-secondary">Edit questions</Link>
            <Button onClick={() => setSource("custom")}>Use a custom list</Button>
          </div>
        </EmptyState>
      );
    } else {
      emptyState = (
        <EmptyState icon="✍" title="Add some names">
          <p style={{ margin: 0 }}>Type one entry per line in the custom list — names, lunch spots, anything.</p>
        </EmptyState>
      );
    }
  }

  return (
    <AppShell>
      <PollNav id={poll.id} slug={poll.slug} title={poll.title} />

      <header className={s.head}>
        <span className="tp-eyebrow">Randomiser arcade</span>
        <h1 className="tp-h1">Pick a <strong className="tp-gradient-text">winner</strong></h1>
      </header>

      <div className={s.layout}>
        <div className={s.source}>
          <EntrySourcePanel
            source={source}
            onSource={setSource}
            bonus={bonus}
            onBonus={setBonus}
            questions={choiceQuestions}
            questionId={questionId}
            onQuestion={setQuestionId}
            customText={customText}
            onCustomText={setCustomText}
            truncated={custom.truncated}
            entries={shown.entries}
            placeholder={shown.placeholder}
            fromDraw={!!draw}
            winners={winnersWanted}
            maxWinners={maxWinners}
            onWinners={setWinnersWanted}
            locked={locked}
          />
        </div>

        <Card className={s.stage}>
          <div className={s.stageTop}>
            <fieldset className={s.fieldset} disabled={locked}>
              <legend className={s.srOnly}>Game</legend>
              <Segmented<GameKind>
                ariaLabel="Game"
                value={game}
                onChange={setGame}
                options={(["spinner", "raffle", "entries"] as GameKind[]).map((k) => ({
                  value: k,
                  label: <span className={s.tabLabel}><GameIcon kind={k} size={16} />{GAME_META[k].short}</span>,
                }))}
              />
            </fieldset>
            <Button variant="ghost" size="sm" className="tp-btn-icon" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Mute sound effects" : "Turn on sound effects"} title={sound ? "Sound on" : "Sound off"}>
              <SoundIcon on={sound} />
            </Button>
          </div>

          <div className={s.gameArea}>
            {empty ? emptyState : game === "spinner" ? <SpinnerWheel {...stageProps} /> : game === "raffle" ? <RaffleDraw {...stageProps} /> : <EntryBoard {...stageProps} />}
          </div>

          {!empty ? (
            <div className={s.actionBar}>
              <Button variant="primary" size="lg" onClick={() => void play()} disabled={!canPlay} loading={busy}>
                {animating ? (game === "spinner" ? "Spinning…" : "Drawing…") : playLabel}
              </Button>
              {draw ? (
                <span className="tp-hint">
                  {revealed} of {draw.winners.length} {draw.winners.length === 1 ? "winner" : "winners"} revealed
                  {!pending ? <> · <button type="button" className={s.linkBtn} onClick={() => void copy(draw)}>Copy results</button></> : null}
                  {pending && !animating && revealed > 0 ? <> · <button type="button" className={s.linkBtn} onClick={revealAll}>Reveal all</button></> : null}
                </span>
              ) : null}
            </div>
          ) : null}

          <p className={s.fair}><ShieldIcon /> <span>Winners are picked on the server with a cryptographically secure weighted draw; the animation just reveals it.</span></p>
        </Card>

        <div className={s.historyArea}>
          <DrawHistory draws={draws} loading={drawsLoading} onCopy={(d) => void copy(d)} live={draw ? { id: draw.id, revealed } : null} />
        </div>
      </div>

      <div className={s.srOnly} aria-live="assertive" aria-atomic="true">{announce}</div>

      <WinnerModal
        open={modal}
        draw={draw}
        revealed={revealed}
        onClose={() => setModal(false)}
        onNext={() => void play()}
        nextLabel={meta.next}
        onCopy={() => draw && void copy(draw, revealed)}
      />
    </AppShell>
  );
}

const confettiCount = () => (typeof window !== "undefined" && window.innerWidth < 560 ? 60 : 110);
