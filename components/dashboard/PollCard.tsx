"use client";
// A poll tile on the dashboard with status, progress and quick actions. Owner: Leonardo.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PollSummary } from "@/lib/types";
import { Badge, cx, useToast } from "@/components/ui";
import { shareUrl } from "@/components/shell/PollNav";
import { Icon, type IconName } from "@/components/builder/icons";
import s from "./Dashboard.module.css";

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

type MenuItem = { label: string; icon: IconName; onSelect?: () => void; href?: string; danger?: boolean };

function MoreMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };
  return (
    <div className={s.menuRoot} ref={root}>
      <button ref={btn} type="button" className={s.iconAction} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={18} />
      </button>
      {open ? (
        <div className={s.menu} role="menu" onKeyDown={onMenuKey}>
          {items.map((it) => it.href ? (
            <Link key={it.label} href={it.href} role="menuitem" className={s.menuItem} onClick={() => setOpen(false)}><Icon name={it.icon} size={16} />{it.label}</Link>
          ) : (
            <button key={it.label} type="button" role="menuitem" className={cx(s.menuItem, it.danger && s.menuDanger)} onClick={() => { setOpen(false); it.onSelect?.(); }}>
              <Icon name={it.icon} size={16} />{it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PollCard({ poll, onDuplicate, onDelete, index }: { poll: PollSummary; onDuplicate: () => void; onDelete: () => void; index: number }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const rate = poll.started ? poll.completed / poll.started : 0;
  const share = async () => {
    try { await navigator.clipboard.writeText(shareUrl(poll.slug)); setCopied(true); toast("Share link copied"); setTimeout(() => setCopied(false), 1600); }
    catch { toast(shareUrl(poll.slug)); }
  };
  const draft = poll.status === "draft";
  const editHref = `/polls/${poll.id}/edit${draft ? "" : "?step=3"}`;

  return (
    <article className={cx(s.card, s[`card_${poll.status}`])} style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <div className={s.cardTop}>
        {poll.status === "open" ? <Badge tone="good" live>Live</Badge> : poll.status === "draft" ? <Badge tone="warn">Draft</Badge> : <Badge>Closed</Badge>}
        <span className={s.access} title={poll.access === "org" ? "Org only" : "Anyone with the link"}>
          <Icon name={poll.access === "org" ? "lock" : "globe"} size={13} />{poll.access === "org" ? "Org" : "Public"}
        </span>
        <span className="tp-spacer" />
        <span className="tp-hint">{timeAgo(poll.updatedAt)}</span>
      </div>

      <Link href={draft ? editHref : `/polls/${poll.id}/results`} className={s.cardTitle}>
        {poll.title || "Untitled poll"}
      </Link>

      <div className={s.cardStats}>
        <span><strong>{poll.questionCount}</strong> question{poll.questionCount === 1 ? "" : "s"}</span>
        {!draft ? <>
          <span aria-hidden>·</span>
          <span><strong>{poll.completed}</strong> voted</span>
          {poll.started > poll.completed ? <><span aria-hidden>·</span><span>{poll.started - poll.completed} in progress</span></> : null}
        </> : null}
      </div>
      {!draft ? (
        <div className={s.meter} role="img" aria-label={`${poll.completed} of ${poll.started} started votes completed`}>
          <span style={{ width: `${Math.round(rate * 100)}%` }} />
        </div>
      ) : <div className={s.meterSpacer} />}

      <div className={s.cardActions}>
        {draft ? (
          <Link href={editHref} className="tp-btn tp-btn-primary tp-btn-sm"><Icon name="edit" size={15} />Continue editing</Link>
        ) : (
          <>
            <button type="button" className={s.action} onClick={share} aria-label={`Copy share link for ${poll.title}`}>
              <Icon name={copied ? "check" : "share"} size={16} /><span>{copied ? "Copied" : "Share"}</span>
            </button>
            <Link href={`/polls/${poll.id}/results`} className={s.action}><Icon name="chart" size={16} /><span>Results</span></Link>
            <Link href={`/polls/${poll.id}/games`} className={s.action}><Icon name="dice" size={16} /><span>Games</span></Link>
          </>
        )}
        <span className="tp-spacer" />
        <MoreMenu label={`More actions for ${poll.title || "poll"}`} items={[
          ...(draft ? [] : [{ label: "Edit", icon: "edit" as const, href: `/polls/${poll.id}/edit` }]),
          { label: "Duplicate", icon: "copy", onSelect: onDuplicate },
          { label: "Delete", icon: "trash", onSelect: onDelete, danger: true },
        ]} />
      </div>
    </article>
  );
}
