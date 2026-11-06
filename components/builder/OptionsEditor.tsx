"use client";
// Options list: Enter to add, Backspace on empty to remove, reorder, optional image per option. Owner: Leonardo.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client/api";
import type { Media, Option } from "@/lib/types";
import { Button, Modal, cx } from "@/components/ui";
import { opt } from "./templates";
import { MediaPicker } from "./MediaPicker";
import { Icon } from "./icons";
import s from "./Builder.module.css";

export function OptionsEditor({ options, onChange, multiple, questionId }: { options: Option[]; onChange: (o: Option[]) => void; multiple: boolean; questionId?: string }) {
  const params = useParams<{ id?: string }>();
  const refs = useRef(new Map<string, HTMLInputElement>());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [imageFor, setImageFor] = useState<string | null>(null);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusId) return;
    if (focusId === "__new") newRef.current?.focus();
    else refs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, options]);

  const set = (id: string, patch: Partial<Option>) => onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const remove = (idx: number) => {
    // Voter-suggested options are server-owned: autosave alone won't drop them, so delete explicitly.
    const target = options[idx];
    if (target?.suggestedBy && params?.id && questionId) {
      void api(`/api/polls/${params.id}/questions/${questionId}/options/${target.id}`, { method: "DELETE" }).catch(() => {});
    }
    const next = options.filter((_, i) => i !== idx);
    onChange(next);
    setFocusId(next[Math.max(0, idx - 1)]?.id ?? "__new");
  };
  const move = (idx: number, d: -1 | 1) => {
    const j = idx + d;
    if (j < 0 || j >= options.length) return;
    const next = options.slice();
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
    setFocusId(next[j]!.id);
  };
  const addFromField = () => {
    const parts = newLabel.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...options, ...parts.map((p) => opt(p))]);
    setNewLabel("");
    setFocusId("__new");
  };
  const imgOption = options.find((o) => o.id === imageFor) ?? null;

  return (
    <div className={s.options}>
      <ul className={s.optionList}>
        {options.map((o, i) => (
          <li key={o.id} className={cx(s.optionRow, "tp-enter")}>
            <span className={cx(s.optionMark, multiple && s.optionMarkSquare)} aria-hidden />
            <button type="button" className={cx(s.optThumb, o.media?.url && s.optThumbSet)} onClick={() => setImageFor(o.id)}
              aria-label={o.media?.url ? `Change image for option ${i + 1}` : `Add image to option ${i + 1}`}>
              {o.media?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.media.url} alt="" />
              ) : <Icon name="image" size={16} />}
            </button>
            <div className={s.optionInputWrap}>
              <input
                ref={(el) => { if (el) refs.current.set(o.id, el); else refs.current.delete(o.id); }}
                className={cx("tp-input", s.optionInput)}
                value={o.label}
                maxLength={120}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
                onChange={(e) => set(o.id, { label: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = options[i + 1];
                    if (next) setFocusId(next.id); else setFocusId("__new");
                  } else if (e.key === "Backspace" && !o.label && options.length > 0) {
                    e.preventDefault();
                    remove(i);
                  } else if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
                  else if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
                }}
              />
              {o.suggestedBy ? <span className={s.suggested} title={`Suggested by ${o.suggestedBy.name}`}>💡 {o.suggestedBy.name}</span> : null}
            </div>
            <span className={s.optionTools}>
              <button type="button" className={s.iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move option ${i + 1} up`}><Icon name="up" size={16} /></button>
              <button type="button" className={s.iconBtn} onClick={() => move(i, 1)} disabled={i === options.length - 1} aria-label={`Move option ${i + 1} down`}><Icon name="down" size={16} /></button>
              <button type="button" className={cx(s.iconBtn, s.iconBtnDanger)} onClick={() => remove(i)} aria-label={`Remove option ${i + 1}`}><Icon name="x" size={16} /></button>
            </span>
          </li>
        ))}
      </ul>
      <form className={s.optionAdd} onSubmit={(e) => { e.preventDefault(); addFromField(); }}>
        <span className={s.optionAddIcon} aria-hidden><Icon name="plus" size={16} /></span>
        <input ref={newRef} className={cx("tp-input", s.optionInput)} value={newLabel} maxLength={120}
          placeholder="Add an option — press Enter" aria-label="New option"
          onChange={(e) => setNewLabel(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              const parts = text.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
              onChange([...options, ...parts.map((p) => opt(p))]);
              setFocusId("__new");
            }
          }} />
        <Button type="submit" size="sm" disabled={!newLabel.trim()} className={s.optionAddBtn}>Add</Button>
      </form>
      <span className="tp-hint">Tip: paste a list (one per line) to add many at once.</span>

      <Modal open={!!imgOption} onClose={() => setImageFor(null)} title="Option image"
        footer={<Button variant="primary" onClick={() => setImageFor(null)}>Done</Button>}>
        {imgOption ? (
          <div className="tp-stack">
            <div className="tp-muted tp-small">For “{imgOption.label || "Untitled option"}”. Pictures make choices easier — think dishes, venues or designs.</div>
            <MediaPicker value={imgOption.media} allowVideo={false} compact
              onChange={(m: Media | null) => set(imgOption.id, { media: m })} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
