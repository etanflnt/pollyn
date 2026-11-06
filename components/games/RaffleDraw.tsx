"use client";
// Raffle draw: slot-machine reel of ticket stubs that decelerates onto the server's winner. Owner: Woz.
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { ordinal, pad4, readMatrix, ticketStarts, totalTickets, visualPick, type GameStageProps } from "./lib";
import s from "./RaffleDraw.module.css";

const ROW = 64;
const REEL_MS = 4200;
const EASE = "cubic-bezier(0.1, 0.7, 0.12, 1)";

interface Item { idx: number; ticket: number; key: string }

export function RaffleDraw({ entries, placeholder, run, current, revealed, reduced, onTick, onLanded }: GameStageProps) {
  const starts = useMemo(() => ticketStarts(entries), [entries]);
  const total = useMemo(() => totalTickets(entries), [entries]);
  const mk = (idx: number, salt: string): Item => {
    const w = Math.max(1, entries[idx]?.weight ?? 1);
    return { idx, ticket: (starts[idx] ?? 1) + Math.floor(Math.random() * w), key: `${salt}-${idx}-${Math.random().toString(36).slice(2, 7)}` };
  };

  const [strip, setStrip] = useState<Item[]>([]);
  const [offset, setOffset] = useState(0);
  const [moving, setMoving] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const state = useRef({ strip, offset });
  state.current = { strip, offset };
  const cb = useRef({ onTick, onLanded });
  cb.current = { onTick, onLanded };
  const running = useRef(false);

  // idle strip whenever the entry list changes (not mid-draw)
  useEffect(() => {
    if (running.current || !entries.length) { if (!entries.length) setStrip([]); return; }
    setStrip([0, 1, 2].map((k) => mk(visualPick(entries, total), `idle${k}`)));
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  useEffect(() => {
    if (!run || !entries.length) return;
    running.current = true;
    const L = reduced ? 3 : 30 + Math.min(16, entries.length);
    const items: Item[] = Array.from({ length: L }, (_, k) => mk(visualPick(entries, total), `r${run.key}-${k}`));
    const visible = state.current.strip.slice(state.current.offset, state.current.offset + 3).filter((it) => it.idx < entries.length);
    if (!reduced && visible.length === 3) items.splice(0, 3, ...visible);
    items[L - 2] = mk(run.winner, `w${run.key}`);
    setMoving(false);
    setStrip(items);
    setOffset(0);

    let raf1 = 0, raf2 = 0, poll = 0;
    let lastRow = -1;
    const finish = () => { running.current = false; setMoving(false); cb.current.onLanded(); };
    if (reduced) {
      const t = window.setTimeout(finish, 60);
      return () => { clearTimeout(t); running.current = false; };
    }
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setMoving(true);
        setOffset(L - 3);
        const loop = () => {
          const el = reelRef.current;
          if (el) {
            const row = Math.round(-readMatrix(el).y / ROW);
            if (lastRow !== -1 && row !== lastRow) cb.current.onTick();
            lastRow = row;
          }
          poll = requestAnimationFrame(loop);
        };
        poll = requestAnimationFrame(loop);
      });
    });
    const t = window.setTimeout(() => { cancelAnimationFrame(poll); finish(); }, REEL_MS + 160);
    return () => { clearTimeout(t); cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); cancelAnimationFrame(poll); running.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.key]);

  const centerIdx = offset + 1;
  const landed = !moving && !run && current !== null;

  return (
    <div className={s.stage}>
      <div className={s.machine}>
        <div className={s.machineTop}>
          <span className="tp-eyebrow">Ticket drum</span>
          <span className={s.drumCount}><strong>{total}</strong> {total === 1 ? "ticket" : "tickets"} · {entries.length} {entries.length === 1 ? "name" : "names"}</span>
        </div>
        <div className={s.window} style={{ height: ROW * 3 }}>
          <div className={s.frame} style={{ top: ROW, height: ROW }} aria-hidden />
          <div
            ref={reelRef}
            className={s.reel}
            style={{ transform: `translateY(${-offset * ROW}px)`, transition: moving ? `transform ${REEL_MS}ms ${EASE}` : "none" }}
            aria-hidden
          >
            {strip.map((it, k) => {
              const e = entries[it.idx];
              const isCenter = k === centerIdx;
              return (
                <div key={it.key} className={s.slot} style={{ height: ROW }}>
                  <div className={cx(s.stub, isCenter && s.stubCenter, isCenter && landed && s.stubWon)}>
                    <span className={s.stubNo}>No.<b>{pad4(it.ticket)}</b></span>
                    <span className={s.stubName}>{placeholder ? "Mystery voter" : e?.label ?? "?"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {revealed.length ? (
        <div className={s.drawn}>
          <div className="tp-eyebrow">Drawn tickets</div>
          <ol className={s.drawnList}>
            {revealed.map((w, i) => (
              <li key={`${w}-${i}`} className={cx(s.stub, s.stubSmall, "tp-enter")}>
                <span className={s.stubNo}>{ordinal(i + 1)}</span>
                <span className={s.stubName}>{entries[w]?.label ?? "?"}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
