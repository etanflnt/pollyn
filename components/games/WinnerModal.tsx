"use client";
// Winner reveal dialog. Owner: Woz.
import type { Draw } from "@/lib/types";
import { Button, Modal } from "@/components/ui";
import { CopyIcon } from "./icons";
import { oddsPct, ordinal, totalTickets } from "./lib";
import s from "./GamesArcade.module.css";

export function WinnerModal({ open, draw, revealed, onClose, onNext, nextLabel, onCopy }: {
  open: boolean;
  draw: Draw | null;
  revealed: number;
  onClose: () => void;
  onNext: () => void;
  nextLabel: string;
  onCopy: () => void;
}) {
  if (!draw || revealed < 1) return null;
  const total = draw.winners.length;
  const idx = draw.winners[revealed - 1]!;
  const winner = draw.entries[idx];
  const tickets = totalTickets(draw.entries);
  const more = revealed < total;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={total > 1 ? `${ordinal(revealed)} winner of ${total}` : "We have a winner!"}
      footer={
        <>
          <Button variant="ghost" onClick={onCopy}><CopyIcon /> Copy</Button>
          {more ? <Button variant="primary" onClick={onNext} autoFocus>{nextLabel} ({revealed + 1}/{total})</Button> : <Button variant="primary" onClick={onClose} autoFocus>Done</Button>}
        </>
      }
    >
      <div className={s.winner}>
        <div className={s.trophy} aria-hidden>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8.5 20h7M10 17h4" />
          </svg>
        </div>
        <div className={`tp-gradient-text ${s.winnerName}`}>{winner?.label ?? "?"}</div>
        {winner ? (
          <div className="tp-muted tp-small">{winner.weight} of {tickets} {tickets === 1 ? "ticket" : "tickets"} · {oddsPct(winner.weight, tickets)} odds</div>
        ) : null}
      </div>
      {total > 1 ? (
        <ol className={s.winnerList}>
          {draw.winners.slice(0, revealed).map((w, i) => (
            <li key={i} className={i === revealed - 1 ? s.winnerListCurrent : undefined}>
              <span className={s.place}>{ordinal(i + 1)}</span>
              <span className={s.winnerListName}>{draw.entries[w]?.label ?? "?"}</span>
            </li>
          ))}
          {Array.from({ length: total - revealed }, (_, i) => (
            <li key={`p${i}`} className={s.winnerListPending}>
              <span className={s.place}>{ordinal(revealed + i + 1)}</span>
              <span className={s.winnerListName}>?</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Modal>
  );
}
