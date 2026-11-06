"use client";
// App chrome: sticky glass topbar with brand, nav slot, theme toggle and user menu. Owner: Leonardo.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/client/auth";
import { Avatar, Button } from "@/components/ui";

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="tp-brand-mark" style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M5 20V12" /><path d="M12 20V5" /><path d="M19 20v-6" />
      </svg>
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    setTheme(attr ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tp-theme", next); } catch {}
    setTheme(next);
  };
  return (
    <Button variant="ghost" size="sm" className="tp-btn-icon" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={flip}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        {theme === "dark"
          ? <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
      </svg>
    </Button>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!user) return null;
  const kind = user.kind === "guest" ? "Guest" : user.isAdmin ? "Admin" : null;
  return (
    <div style={{ position: "relative" }} ref={root}>
      <button ref={btn} className="tp-btn tp-btn-ghost tp-btn-sm" onClick={() => setOpen((m) => !m)} aria-expanded={open} aria-haspopup="true"
        aria-label={`Account: ${user.name}`} style={{ paddingLeft: 4, minHeight: 40 }}>
        <Avatar name={user.name} /><span className="hide-sm">{user.name.split(" ")[0]}</span>
      </button>
      {open ? (
        <div className="tp-card tp-menu-pop">
          <div className="tp-row" style={{ gap: 10, flexWrap: "nowrap", marginBottom: 12 }}>
            <Avatar name={user.name} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
              <div className="tp-hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email ?? "No email"}</div>
            </div>
          </div>
          {kind ? <span className={`tp-badge ${kind === "Admin" ? "tp-badge-accent" : ""}`} style={{ marginBottom: 12 }}>{kind}</span> : null}
          <Button variant="secondary" size="sm" block onClick={() => { setOpen(false); void signOut(); }}>Sign out</Button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children, actions, wide = true }: { children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <>
      <a href="#tp-main" className="tp-skip">Skip to content</a>
      <header className="tp-topbar">
        <div className="tp-container">
          <Link href="/" className="tp-brand" aria-label="Pollyn home"><BrandMark /> <span>Pollyn</span></Link>
          <span className="tp-spacer" />
          {actions}
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <main id="tp-main" className={wide ? "tp-container" : "tp-container tp-narrow"} style={{ paddingTop: 24, paddingBottom: 64 }}>{children}</main>
    </>
  );
}
