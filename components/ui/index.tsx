"use client";
// Shared UI kit. Owner: Leonardo (design). Everyone may import; ask Leonardo (via report) for changes.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { Media } from "@/lib/types";
import { toVideoEmbed } from "@/lib/media";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/* ---------- Button ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", size, block, loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "lg"; block?: boolean; loading?: boolean }) {
  return (
    <button className={cx("tp-btn", `tp-btn-${variant}`, size && `tp-btn-${size}`, block && "tp-btn-block", className)} disabled={disabled || loading} {...rest}>
      {loading ? <span className="tp-spinner" style={{ width: 16, height: 16 }} /> : null}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ className, interactive, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cx("tp-card", interactive && "tp-card-interactive", className)} {...rest}>{children}</div>;
}

/* ---------- Form fields ---------- */
export function Field({ label, hint, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="tp-field">
      {label ? <label className="tp-label" htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {hint ? <span className="tp-hint">{hint}</span> : null}
    </div>
  );
}
export function Input({ className, large, ...rest }: InputHTMLAttributes<HTMLInputElement> & { large?: boolean }) {
  return <input className={cx("tp-input", large && "tp-input-lg", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("tp-textarea", className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className="tp-toggle" style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
      <span>
        <span style={{ fontWeight: 600, display: "block" }}>{label}</span>
        {hint ? <span className="tp-hint">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="tp-toggle-track" aria-hidden />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="tp-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ---------- Badge / Progress / Spinner / Avatar ---------- */
export function Badge({ tone, children, live }: { tone?: "accent" | "good" | "warn" | "danger"; children: ReactNode; live?: boolean }) {
  return <span className={cx("tp-badge", tone && `tp-badge-${tone}`)}>{live ? <span className="tp-dot tp-dot-live" /> : null}{children}</span>;
}
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return <div className="tp-progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>;
}
export function Spinner({ size = 22 }: { size?: number }) {
  return <span className="tp-spinner" style={{ width: size, height: size, display: "inline-block" }} role="status" aria-label="Loading" />;
}
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
  return <span className="tp-avatar" title={name}>{initials}</span>;
}
export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="tp-empty tp-enter">
      {icon ? <div style={{ fontSize: 40, marginBottom: 8 }}>{icon}</div> : null}
      <div className="tp-h3" style={{ color: "var(--ink)" }}>{title}</div>
      {children ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}

/* ---------- Media (image / video embed) ---------- */
export function MediaView({ media, className }: { media: Media | null | undefined; className?: string }) {
  if (!media?.url) return null;
  if (media.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <div className={cx("tp-media", className)}><img src={media.url} alt={media.alt ?? ""} loading="lazy" /></div>;
  }
  const embed = toVideoEmbed(media.url);
  if (!embed) return <div className={cx("tp-media", className)} style={{ padding: 16 }}><a href={media.url} target="_blank" rel="noreferrer">Open video ↗</a></div>;
  return (
    <div className={cx("tp-media tp-media-video", className)}>
      {embed.type === "iframe"
        ? <iframe src={embed.src} title={media.alt ?? "Video"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" loading="lazy" />
        : <video src={embed.src} controls playsInline />}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="tp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tp-modal" role="dialog" aria-modal="true">
        {title ? <div className="tp-row" style={{ marginBottom: 16 }}><h2 className="tp-h3">{title}</h2><span className="tp-spacer" /><Button variant="ghost" size="sm" className="tp-btn-icon" aria-label="Close" onClick={onClose}>✕</Button></div> : null}
        {children}
        {footer ? <div className="tp-row" style={{ marginTop: 20, justifyContent: "flex-end" }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; tone?: "error" };
const ToastCtx = createContext<(text: string, tone?: "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone?: "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="tp-toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={cx("tp-toast", t.tone)}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- Confetti (tiny, dependency-free) ---------- */
export function burstConfetti(count = 80) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#8CE3C6", "#4C9A96", "#4F5FD6", "#E9B35A", "#0B7A6E"];
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden";
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    const size = 6 + Math.random() * 6;
    p.style.cssText = `position:absolute;left:${50 + (Math.random() - 0.5) * 20}%;top:40%;width:${size}px;height:${size * 0.6}px;background:${colors[i % colors.length]};border-radius:2px`;
    layer.appendChild(p);
    const dx = (Math.random() - 0.5) * window.innerWidth * 0.9;
    const dy = window.innerHeight * (0.3 + Math.random() * 0.6);
    p.animate(
      [{ transform: "translate(0,0) rotate(0)", opacity: 1 }, { transform: `translate(${dx}px, ${-120 - Math.random() * 160}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx * 1.2}px, ${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
      { duration: 1600 + Math.random() * 900, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), 2800);
}

/* ---------- Poll cover themes (brand gradients; shared by builder, voter, dashboard) ---------- */
export type PollThemeKey = "teal" | "blue" | "mint" | "sunset";
export const POLL_THEMES: Record<PollThemeKey, { label: string; gradient: string; ink: string }> = {
  teal: { label: "Teal", gradient: "linear-gradient(135deg, #0B7A6E 0%, #4C9A96 45%, #4F5FD6 100%)", ink: "#FFFFFF" },
  blue: { label: "Blue", gradient: "linear-gradient(135deg, #4F5FD6 0%, #3A47B0 50%, #171A42 100%)", ink: "#FFFFFF" },
  mint: { label: "Mint", gradient: "linear-gradient(135deg, #C9F4E4 0%, #8CE3C6 50%, #4C9A96 100%)", ink: "#171A42" },
  sunset: { label: "Sunset", gradient: "linear-gradient(135deg, #F2C77B 0%, #E9B35A 35%, #D9704F 100%)", ink: "#171A42" },
};
export const pollTheme = (k: string | null | undefined) => POLL_THEMES[(k as PollThemeKey) in POLL_THEMES ? (k as PollThemeKey) : "teal"];

/* ---------- Skeleton block ---------- */
export function Skeleton({ width = "100%", height = 16, radius, className, style }: { width?: number | string; height?: number | string; radius?: number | string; className?: string; style?: React.CSSProperties }) {
  return <span className={cx("tp-skeleton", className)} aria-hidden style={{ display: "block", width, height, borderRadius: radius, ...style }} />;
}
