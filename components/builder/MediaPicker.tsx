"use client";
// Image upload / image URL / video link picker with live preview. Owner: Leonardo.
import { useId, useRef, useState } from "react";
import type { Media } from "@/lib/types";
import { api } from "@/lib/client/api";
import { isValidHttpUrl, toVideoEmbed } from "@/lib/media";
import { Button, Input, MediaView, Segmented, Spinner, cx, useToast } from "@/components/ui";
import { Icon } from "./icons";
import s from "./Builder.module.css";

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
type Mode = "upload" | "url" | "video";

function videoHost(raw: string): string | null {
  try {
    const h = new URL(raw).hostname;
    if (/youtu/.test(h)) return "YouTube";
    if (/vimeo/.test(h)) return "Vimeo";
    if (/loom/.test(h)) return "Loom";
    if (/sharepoint|microsoftstream/.test(h)) return "Microsoft Stream";
    return "Video file";
  } catch { return null; }
}

export async function uploadImage(file: File): Promise<string> {
  if (!TYPES.includes(file.type)) throw new Error("Use a PNG, JPG, GIF or WebP image");
  if (file.size > MAX_BYTES) throw new Error("Images must be 3 MB or smaller");
  const fd = new FormData();
  fd.append("file", file);
  const { url } = await api<{ url: string }>("/api/uploads", { method: "POST", body: fd });
  return url;
}

export function MediaPicker({ value, onChange, allowVideo = true, compact }: {
  value: Media | null | undefined;
  onChange: (m: Media | null) => void;
  allowVideo?: boolean;
  compact?: boolean;
}) {
  const toast = useToast();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setBusy(true);
    try { onChange({ kind: "image", url: await uploadImage(file), alt: "" }); }
    catch (e) { toast((e as Error).message || "Upload failed", "error"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  if (value?.url) {
    return (
      <div className={s.mediaSet}>
        <MediaView media={value} className={compact ? s.mediaPreviewSm : undefined} />
        <div className="tp-row" style={{ gap: 8 }}>
          {value.kind === "image" ? (
            <Input aria-label="Image description (alt text)" placeholder="Describe the image (alt text)" value={value.alt ?? ""}
              onChange={(e) => onChange({ ...value, alt: e.target.value })} style={{ flex: "1 1 180px" }} maxLength={140} />
          ) : <span className="tp-badge tp-badge-accent"><Icon name="video" size={14} />{videoHost(value.url) ?? "Video"}</span>}
          <span className="tp-spacer" />
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Icon name="trash" size={16} />Remove</Button>
        </div>
      </div>
    );
  }

  const trimmed = url.trim();
  const videoOk = mode === "video" && trimmed ? !!toVideoEmbed(trimmed) : false;
  const urlOk = mode === "url" && trimmed ? isValidHttpUrl(trimmed) : false;
  const submitUrl = () => {
    if (mode === "video") {
      if (!videoOk) return toast("Paste a YouTube, Vimeo, Loom, Stream or .mp4 link", "error");
      onChange({ kind: "video", url: trimmed });
    } else {
      if (!urlOk) return toast("That doesn't look like an image link", "error");
      onChange({ kind: "image", url: trimmed, alt: "" });
    }
    setUrl("");
  };

  const modes: { value: Mode; label: React.ReactNode }[] = [
    { value: "upload", label: <><Icon name="upload" size={14} /> Upload</> },
    { value: "url", label: <><Icon name="link" size={14} /> Image link</> },
  ];
  if (allowVideo) modes.push({ value: "video", label: <><Icon name="video" size={14} /> Video</> });

  return (
    <div className={s.mediaPicker}>
      {modes.length > 1 ? <Segmented value={mode} onChange={(m) => { setMode(m); setUrl(""); }} options={modes} ariaLabel="Media source" /> : null}
      {mode === "upload" ? (
        <label
          htmlFor={`${uid}-file`}
          className={cx(s.drop, drag && s.dropActive, compact && s.dropCompact)}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFile(e.dataTransfer.files?.[0]); }}
        >
          <input ref={fileRef} id={`${uid}-file`} type="file" accept={TYPES.join(",")} className={s.srOnly}
            onChange={(e) => void handleFile(e.target.files?.[0])} disabled={busy} />
          {busy ? <Spinner /> : <span className={s.dropIcon}><Icon name="image" size={22} /></span>}
          <span><strong>{busy ? "Uploading…" : "Choose an image"}</strong>{!compact ? <span className="tp-muted"> or drop it here</span> : null}</span>
          <span className="tp-hint">PNG, JPG, GIF or WebP · up to 3 MB</span>
        </label>
      ) : (
        <form className={s.urlRow} onSubmit={(e) => { e.preventDefault(); submitUrl(); }}>
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
            aria-label={mode === "video" ? "Video link" : "Image link"}
            placeholder={mode === "video" ? "https://youtube.com/watch?v=…" : "https://…/photo.jpg"} />
          <Button type="submit" disabled={!trimmed}>Add</Button>
          {mode === "video" && trimmed ? (
            <span className={cx("tp-hint", s.urlHint, videoOk ? s.ok : s.bad)} role="status">
              {videoOk ? <>✓ {videoHost(trimmed)} link — preview appears once added</> : "We support YouTube, Vimeo, Loom, Microsoft Stream or .mp4/.webm links"}
            </span>
          ) : null}
        </form>
      )}
    </div>
  );
}
