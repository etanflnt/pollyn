"use client";
// Owner-side tabs shown on edit / results / games pages. Owner: orchestrator.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";

export function shareUrl(slug: string) {
  return typeof window === "undefined" ? `/p/${slug}` : `${window.location.origin}/p/${slug}`;
}

export function PollNav({ id, slug, title }: { id: string; slug?: string; title?: string }) {
  const path = usePathname();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const tabs = [
    { href: `/polls/${id}/edit`, label: "Build" },
    { href: `/polls/${id}/results`, label: "Results" },
    { href: `/polls/${id}/games`, label: "Games" },
  ];
  const copy = async () => {
    if (!slug) return;
    try { await navigator.clipboard.writeText(shareUrl(slug)); setCopied(true); toast("Share link copied"); setTimeout(() => setCopied(false), 1500); }
    catch { toast(shareUrl(slug)); }
  };
  return (
    <div className="tp-row" style={{ marginBottom: 20, gap: 12 }}>
      {title ? <div className="tp-h3" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 200px" }}>{title}</div> : <span className="tp-spacer" />}
      <nav className="tp-seg" aria-label="Poll sections">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} style={{ textDecoration: "none" }}>
            <button type="button" aria-pressed={path === t.href} tabIndex={-1}>{t.label}</button>
          </Link>
        ))}
      </nav>
      {slug ? <Button size="sm" onClick={copy}>{copied ? "✓ Copied" : "Share link"}</Button> : null}
    </div>
  );
}
