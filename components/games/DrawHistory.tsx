"use client";
// Past draws (newest first) with copy-to-clipboard. Owner: Woz.
import { useState } from "react";
import type { Draw } from "@/lib/types";
import { Button, Card } from "@/components/ui";
import { CopyIcon, GameIcon } from "./icons";
import { GAME_META, SOURCE_LABEL, timeAgo } from "./lib";
import s from "./GamesArcade.module.css";

const PAGE = 8;

/** `live`: the draw being revealed right now; its unrevealed winners stay hidden so history doesn't spoil the spin. */
export function DrawHistory({ draws, loading, onCopy, live }: { draws: Draw[]; loading: boolean; onCopy: (d: Draw) => void; live?: { id: string; revealed: number } | null }) {
  const [all, setAll] = useState(false);
  const shown = all ? draws : draws.slice(0, PAGE);
  return (
    <Card className={s.panel}>
      <div className={s.panelTitle}>
        <span className="tp-eyebrow">History</span>
        <span className="tp-h3">Past draws</span>
      </div>
      {loading ? (
        <div className="tp-stack" style={{ gap: 8 }}>{[0, 1].map((i) => <div key={i} className="tp-skeleton" style={{ height: 56 }} />)}</div>
      ) : !draws.length ? (
        <p className="tp-hint" style={{ margin: 0 }}>No draws yet. Your winners will be listed here.</p>
      ) : (
        <ul className={s.history}>
          {shown.map((d) => (
            <li key={d.id} className={s.historyItem}>
              <span className={s.historyIcon} title={GAME_META[d.game].label}><GameIcon kind={d.game} /></span>
              <div className={s.historyMain}>
                <div className={s.historyMeta}>
                  <strong>{GAME_META[d.game].label}</strong>
                  <span className="tp-muted">· <time dateTime={d.createdAt} title={new Date(d.createdAt).toLocaleString()}>{timeAgo(d.createdAt)}</time></span>
                </div>
                <div className={s.historyWinners}>
                  {d.winners.map((w, i) => (
                    <span key={i} className={s.winnerChip}><b>{i + 1}</b>{live?.id === d.id && i >= live.revealed ? "?" : d.entries[w]?.label ?? "?"}</span>
                  ))}
                </div>
                <div className="tp-hint">{SOURCE_LABEL[d.source]} · {d.entries.length} {d.entries.length === 1 ? "entry" : "entries"}</div>
              </div>
              {live?.id === d.id && live.revealed < d.winners.length ? null : <Button variant="ghost" size="sm" className="tp-btn-icon" aria-label="Copy results" title="Copy results" onClick={() => onCopy(d)}><CopyIcon /></Button>}
            </li>
          ))}
        </ul>
      )}
      {draws.length > PAGE ? (
        <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${draws.length}`}</Button>
      ) : null}
    </Card>
  );
}
