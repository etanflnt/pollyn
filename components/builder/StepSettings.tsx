"use client";
import type { PollAccess, PollSettings, ResultsVisibility } from "@/lib/types";
import { POLL_THEMES, Segmented, Toggle, cx, type PollThemeKey } from "@/components/ui";
import { isoToLocalInput, localInputToIso, type Issue } from "./draft";
import { Icon, type IconName } from "./icons";
import s from "./Builder.module.css";

const ACCESS: { value: PollAccess; icon: IconName; title: string; body: string }[] = [
  { value: "org", icon: "lock", title: "Org only", body: "Voters sign in with Teams / Microsoft from your organisation." },
  { value: "public", icon: "globe", title: "Anyone with the link", body: "Guests can join with just a display name. Great for mixed groups." },
];

const RESULTS: { value: ResultsVisibility; label: string; hint: string }[] = [
  { value: "always", label: "Always", hint: "Voters can peek at results any time — even before voting." },
  { value: "after_vote", label: "After voting", hint: "Results unlock once someone submits their vote." },
  { value: "after_close", label: "After close", hint: "A big reveal: nobody sees results until you close the poll." },
  { value: "owner_only", label: "Only me", hint: "Results stay private to you." },
];

function preset(kind: "hour" | "eod" | "tomorrow" | "week"): string {
  const d = new Date();
  if (kind === "hour") d.setHours(d.getHours() + 1);
  if (kind === "eod") { d.setHours(17, 0, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); }
  if (kind === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); }
  if (kind === "week") { d.setDate(d.getDate() + 7); d.setSeconds(0, 0); }
  return d.toISOString();
}

export function StepSettings({ settings, onChange, issues }: { settings: PollSettings; onChange: (p: Partial<PollSettings>) => void; issues: Issue[] }) {
  const closeIssue = issues.find((i) => i.id === "closes");
  const res = RESULTS.find((r) => r.value === settings.resultsVisibility) ?? RESULTS[1]!;
  return (
    <div className={s.stepBody}>
      <header className={s.stepHead}>
        <span className="tp-eyebrow">Step 3 · Settings</span>
        <h1 className="tp-h1">Set the <strong>ground rules</strong></h1>
        <p className="tp-muted">Sensible defaults are on. Change only what you need.</p>
      </header>

      <section className={s.group} aria-labelledby="set-access">
        <h2 id="set-access" className={s.groupTitle}>Who can vote</h2>
        <div className={s.radioTiles} role="radiogroup" aria-labelledby="set-access">
          {ACCESS.map((a) => (
            <button key={a.value} type="button" role="radio" aria-checked={settings.access === a.value}
              className={cx("tp-choice", s.radioTile)} onClick={() => onChange({ access: a.value })}>
              <span className={s.radioTileIcon}><Icon name={a.icon} size={20} /></span>
              <span><strong>{a.title}</strong><span className="tp-hint" style={{ display: "block" }}>{a.body}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className={s.group} aria-labelledby="set-results">
        <h2 id="set-results" className={s.groupTitle}>Who sees results</h2>
        <div className={s.resultsSeg}>
          <Segmented ariaLabel="Results visibility" value={settings.resultsVisibility}
            onChange={(resultsVisibility) => onChange({ resultsVisibility })}
            options={RESULTS.map((r) => ({ value: r.value, label: r.label }))} />
        </div>
        <p className="tp-hint" style={{ margin: "8px 0 0" }}>{res.hint}</p>
      </section>

      <section className={cx(s.group, s.toggles)} aria-labelledby="set-privacy">
        <h2 id="set-privacy" className={s.groupTitle}>Privacy</h2>
        <Toggle checked={settings.showVoteCounts} onChange={(showVoteCounts) => onChange({ showVoteCounts })}
          label="Show vote counts" hint="Voters see how many people have voted" />
        <Toggle checked={settings.anonymous} onChange={(anonymous) => onChange({ anonymous, ...(anonymous ? { showVoterNames: false } : {}) })}
          label="Anonymous voting" hint="Names are never stored with answers — not even for you" />
        <Toggle checked={settings.showVoterNames && !settings.anonymous} disabled={settings.anonymous}
          onChange={(showVoterNames) => onChange({ showVoterNames })}
          label="Show voter names" hint={settings.anonymous ? "Unavailable while voting is anonymous" : "Voters can see who picked what"} />
      </section>

      <section className={s.group} aria-labelledby="set-close">
        <h2 id="set-close" className={s.groupTitle}>Closing time <span className="tp-muted" style={{ fontWeight: 500 }}>(optional)</span></h2>
        <div className={s.closeRow}>
          <input id="set-close-at" type="datetime-local" className={cx("tp-input", s.dateInput)} aria-labelledby="set-close"
            value={isoToLocalInput(settings.closesAt)} onChange={(e) => onChange({ closesAt: localInputToIso(e.target.value) })} />
          {settings.closesAt ? <button type="button" className={s.textBtn} onClick={() => onChange({ closesAt: null })}><Icon name="x" size={16} />Clear</button> : null}
        </div>
        <div className={s.chips}>
          {([["hour", "In 1 hour"], ["eod", "End of day"], ["tomorrow", "Tomorrow noon"], ["week", "In a week"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={s.addChip} onClick={() => onChange({ closesAt: preset(k) })}><Icon name="calendar" size={14} />{l}</button>
          ))}
        </div>
        {closeIssue ? <span className={s.inlineIssue} role="alert">{closeIssue.message}</span> : <span className="tp-hint">Leave empty to close it yourself.</span>}
      </section>

      <section className={s.group} aria-labelledby="set-theme">
        <h2 id="set-theme" className={s.groupTitle}>Cover theme</h2>
        <div className={s.themes} role="radiogroup" aria-labelledby="set-theme">
          {(Object.keys(POLL_THEMES) as PollThemeKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={settings.theme === k} className={s.themeSwatch}
              onClick={() => onChange({ theme: k })}>
              <span className={s.themeChip} style={{ background: POLL_THEMES[k].gradient, color: POLL_THEMES[k].ink }}>
                {settings.theme === k ? <Icon name="check" size={18} strokeWidth={3} /> : null}
              </span>
              <span className="tp-small">{POLL_THEMES[k].label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
