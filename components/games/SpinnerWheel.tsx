"use client";
// Spinner wheel: SVG segments sized by weight, rotates so the server's winner lands under the pointer. Owner: Woz.
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { readMatrix, segmentColor, totalTickets, type GameStageProps } from "./lib";
import s from "./SpinnerWheel.module.css";

const C = 200;          // svg centre
const R = 184;          // segment radius
const SPIN_MS = 4800;
const EASE = "cubic-bezier(0.12, 0.72, 0.08, 1)";
const LABEL_LIMIT = 72; // hide labels on very crowded wheels

const pt = (deg: number, r: number) => {
  const t = (deg * Math.PI) / 180;
  return [C + r * Math.sin(t), C - r * Math.cos(t)] as const;
};

function truncate(label: string, max: number) {
  return label.length <= max ? label : `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function SpinnerWheel({ entries, placeholder, run, current, previous, reduced, onTick, onLanded, onPlay, canPlay, playLabel }: GameStageProps) {
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const rotRef = useRef(0);
  const rotorRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onTick, onLanded });
  cb.current = { onTick, onLanded };

  const segs = useMemo(() => {
    const total = totalTickets(entries) || 1;
    let acc = 0;
    const n = entries.length;
    return entries.map((e, i) => {
      const a0 = (acc / total) * 360;
      acc += Math.max(1, e.weight);
      const a1 = (acc / total) * 360;
      const sweep = a1 - a0;
      const color = segmentColor(i, n);
      let path: string | null = null;
      if (sweep < 359.999) {
        const [x0, y0] = pt(a0, R);
        const [x1, y1] = pt(a1, R);
        path = `M${C} ${C} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
      }
      // label sizing: arc length at ~60% radius bounds the font size, radial room bounds the characters
      const arc = ((Math.min(sweep, 180) * Math.PI) / 180) * R * 0.6;
      const fontSize = Math.max(9, Math.min(17, arc * 0.55));
      const maxChars = Math.max(3, Math.floor((R * 0.66) / (fontSize * 0.6)));
      const showLabel = n <= LABEL_LIMIT && sweep >= 4.2;
      const text = placeholder ? "?" : truncate(e.label, maxChars);
      return { i, a0, a1, mid: (a0 + a1) / 2, path, color, fontSize, showLabel, text };
    });
  }, [entries, placeholder]);

  const segsRef = useRef(segs);
  segsRef.current = segs;

  useEffect(() => {
    if (!run) return;
    const seg = segsRef.current[run.winner];
    if (!seg) { cb.current.onLanded(); return; }
    const span = seg.a1 - seg.a0;
    const theta = seg.a0 + span * (0.15 + Math.random() * 0.7); // random spot inside the winning segment
    const cur = rotRef.current;
    const desired = (360 - theta) % 360;                         // rotation that puts theta under the top pointer
    const delta = (((desired - (cur % 360)) % 360) + 360) % 360;
    const turns = reduced ? 0 : 5 + Math.floor(Math.random() * 3);
    const target = cur + delta + 360 * turns;
    rotRef.current = target;
    setSpinning(!reduced);
    setRot(target);

    let raf = 0;
    let lastIdx = -1;
    let lastFlick = 0;
    if (!reduced) {
      const loop = () => {
        const el = rotorRef.current;
        if (el) {
          const { angle } = readMatrix(el);
          const under = (((360 - angle) % 360) + 360) % 360;
          const list = segsRef.current;
          let lo = 0, hi = list.length - 1;
          while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]!.a1 <= under) lo = m + 1; else hi = m; }
          if (lastIdx !== -1 && lo !== lastIdx) {
            cb.current.onTick();
            const now = performance.now();
            if (now - lastFlick > 70 && pointerRef.current?.animate) {
              lastFlick = now;
              pointerRef.current.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-18deg)" }, { transform: "rotate(0deg)" }], { duration: 120, easing: "ease-out" });
            }
          }
          lastIdx = lo;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    const t = window.setTimeout(() => { cancelAnimationFrame(raf); setSpinning(false); cb.current.onLanded(); }, reduced ? 60 : SPIN_MS + 120);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.key]);

  const prevSet = useMemo(() => new Set(previous), [previous]);
  const n = entries.length;
  const bulbs = useMemo(() => Array.from({ length: 24 }, (_, i) => pt((i * 360) / 24, R + 9)), []);

  return (
    <div className={s.stage}>
      <div className={s.wheelWrap}>
        <div ref={pointerRef} className={s.pointer} aria-hidden>
          <svg viewBox="0 0 36 44" width="100%" height="100%">
            <path d="M18 42 L3 8 A16 16 0 0 1 33 8 Z" fill="#E9B35A" stroke="#171A42" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="18" cy="13" r="4.5" fill="#171A42" />
          </svg>
        </div>
        <div
          ref={rotorRef}
          className={s.rotor}
          style={{ transform: `rotate(${rot}deg)`, transition: spinning ? `transform ${SPIN_MS}ms ${EASE}` : "none" }}
        >
          <svg viewBox="0 0 400 400" width="100%" height="100%" role="img" aria-label={`Wheel with ${n} ${n === 1 ? "entry" : "entries"}`}>
            <circle cx={C} cy={C} r={R + 14} className={s.rim} />
            {bulbs.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.2} className={cx(s.bulb, i % 2 === 0 && s.bulbAlt)} />)}
            {segs.map((g) => {
              const cls = cx(s.seg, current === g.i && s.segWin, prevSet.has(g.i) && s.segDim, current !== null && current !== g.i && s.segFade);
              return (
                <g key={g.i} className={cls}>
                  {g.path ? <path d={g.path} fill={g.color.fill} /> : <circle cx={C} cy={C} r={R} fill={g.color.fill} />}
                  {g.showLabel ? (
                    <text
                      x={C + R * 0.9}
                      y={C}
                      transform={`rotate(${g.mid - 90} ${C} ${C})`}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={g.fontSize}
                      fill={g.color.ink}
                      className={s.label}
                    >
                      {g.text}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {n > 1 && n <= 180 ? segs.map((g) => {
              const [x, y] = pt(g.a0, R);
              return <line key={`l${g.i}`} x1={C} y1={C} x2={x} y2={y} className={s.divider} />;
            }) : null}
            <circle cx={C} cy={C} r={R} className={s.innerRing} />
          </svg>
        </div>
        <button type="button" className={s.hub} onClick={onPlay} disabled={!canPlay} aria-label={playLabel}>
          <span>{spinning ? "…" : "SPIN"}</span>
        </button>
      </div>
      {n > LABEL_LIMIT ? <p className="tp-hint" style={{ textAlign: "center" }}>{n} entries — labels hidden, the winner is revealed when the wheel stops.</p> : null}
    </div>
  );
}
