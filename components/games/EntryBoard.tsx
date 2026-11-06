"use client";
// Entry count: leaderboard of tickets per entrant with odds, then a highlight sweep that settles on the winner. Owner: Woz.
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { initials, oddsPct, totalTickets, type GameStageProps } from "./lib";
import s from "./EntryBoard.module.css";

const MAX_CHIPS = 10;

export function EntryBoard({ entries, placeholder, run, current, previous, reduced, onTick, onLanded }: GameStageProps) {
  const total = useMemo(() => totalTickets(entries), [entries]);
  const order = useMemo(() => entries.map((_, i) => i).sort((a, b) => entries[b]!.weight - entries[a]!.weight), [entries]);
  const posOf = useMemo(() => { const m = new Map<number, number>(); order.forEach((idx, p) => m.set(idx, p)); return m; }, [order]);
  const maxW = useMemo(() => entries.reduce((m, e) => Math.max(m, e.weight), 1), [entries]);
  const prevSet = useMemo(() => new Set(previous), [previous]);

  const [hl, setHl] = useState(-1);
  const listRef = useRef<HTMLOListElement>(null);
  const cb = useRef({ onTick, onLanded });
  cb.current = { onTick, onLanded };
  const orderRef = useRef(order);
  orderRef.current = order;
  const posRef = useRef(posOf);
  posRef.current = posOf;

  useEffect(() => {
    if (!run) return;
    const n = orderRef.current.length;
    const winPos = posRef.current.get(run.winner) ?? 0;
    let t = 0;
    if (reduced || n === 0) {
      setHl(winPos);
      t = window.setTimeout(() => cb.current.onLanded(), 60);
      return () => clearTimeout(t);
    }
    const S = n === 1 ? 6 : Math.max(14, Math.min(3 * n, 40));
    const start = (((winPos - S) % n) + n) % n;
    let k = 0;
    const step = () => {
      k++;
      setHl((start + k) % n);
      cb.current.onTick();
      if (k >= S) { t = window.setTimeout(() => cb.current.onLanded(), 320); return; }
      t = window.setTimeout(step, 32 + 300 * Math.pow(k / S, 3));
    };
    t = window.setTimeout(step, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.key]);

  // keep the sweeping highlight in view without scrolling the page
  useEffect(() => {
    const list = listRef.current;
    if (!list || hl < 0) return;
    const row = list.children[hl] as HTMLElement | undefined;
    if (!row) return;
    const top = row.offsetTop, bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }, [hl]);

  // clear highlight when the list changes
  useEffect(() => { setHl(-1); }, [entries]);

  const sweeping = run !== null;
  const top = order.length ? entries[order[0]!]! : null;

  return (
    <div className={s.board}>
      <div className={s.stats}>
        <div className={s.stat}><span className={s.statNum}>{entries.length}</span><span className="tp-eyebrow">Entrants</span></div>
        <div className={s.stat}><span className={s.statNum}>{total}</span><span className="tp-eyebrow">Tickets</span></div>
        <div className={s.stat}><span className={s.statNum}>{top ? oddsPct(top.weight, total) : "—"}</span><span className="tp-eyebrow">Best odds</span></div>
      </div>
      {placeholder ? <p className="tp-hint" style={{ margin: 0 }}>Voter names (and suggestion bonus tickets) are revealed when you draw.</p> : null}
      <ol ref={listRef} className={cx(s.list, sweeping && s.listSweeping)} aria-label="Entries and their tickets">
        {order.map((idx, p) => {
          const e = entries[idx]!;
          const isWin = current === idx;
          const isPrev = prevSet.has(idx);
          const chips = Math.min(e.weight, MAX_CHIPS);
          const label = placeholder ? `Mystery voter #${idx + 1}` : e.label;
          return (
            <li
              key={`${idx}-${e.label}`}
              className={cx(s.row, hl === p && sweeping && s.rowHl, isWin && !sweeping && s.rowWin, isPrev && s.rowPrev)}
            >
              <span className={s.rank}>{p + 1}</span>
              <span className={s.avatar} aria-hidden>{placeholder ? "?" : initials(e.label)}</span>
              <span className={s.main}>
                <span className={s.nameLine}>
                  <span className={s.name} title={label}>{label}</span>
                  {isWin && !sweeping ? <span className="tp-badge tp-badge-accent">Winner</span> : null}
                  {isPrev ? <span className="tp-badge tp-badge-good">Won</span> : null}
                </span>
                <span className={s.chips} aria-hidden>
                  {Array.from({ length: chips }, (_, i) => <i key={i} className={s.chip} />)}
                  {e.weight > MAX_CHIPS ? <span className={s.more}>+{e.weight - MAX_CHIPS}</span> : null}
                </span>
                <span className={s.bar} aria-hidden><span style={{ width: `${(e.weight / maxW) * 100}%` }} /></span>
              </span>
              <span className={s.odds}>
                <b>{oddsPct(e.weight, total)}</b>
                <span>{e.weight} {e.weight === 1 ? "ticket" : "tickets"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
