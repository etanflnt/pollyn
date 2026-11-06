"use client";
// Sign-in card used by home (creators) and the voter flow. Owner: orchestrator.
import { useState } from "react";
import { useAuth } from "@/lib/client/auth";
import { Button, Card, Field, Input, useToast } from "@/components/ui";
import { BrandMark } from "./AppShell";

export function SignInCard({ allowGuest = false, title = "Sign in to continue", subtitle }: { allowGuest?: boolean; title?: string; subtitle?: string }) {
  const { me, signInOrg, signInGuest } = useAuth();
  const toast = useToast();
  const dev = me?.config.authMode === "dev";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState<"org" | "guest" | null>(null);

  const org = async () => {
    setBusy("org");
    try { await signInOrg(dev ? { name: name.trim(), email: email.trim() } : undefined); }
    catch (e) { toast((e as Error).message || "Sign-in failed", "error"); }
    finally { setBusy(null); }
  };
  const guest = async () => {
    setBusy("guest");
    try { await signInGuest(guestName.trim()); }
    catch (e) { toast((e as Error).message || "Could not continue", "error"); }
    finally { setBusy(null); }
  };

  return (
    <Card className="tp-enter" style={{ maxWidth: 440, margin: "8vh auto 0", padding: 28 }}>
      <div className="tp-stack" style={{ gap: 20 }}>
        <div className="tp-row"><BrandMark size={40} /><div><div className="tp-h3">{title}</div>{subtitle ? <div className="tp-muted tp-small">{subtitle}</div> : null}</div></div>

        {dev ? (
          <form className="tp-stack" onSubmit={(e) => { e.preventDefault(); void org(); }}>
            <div className="tp-badge tp-badge-warn" style={{ alignSelf: "flex-start" }}>Dev mode · no Microsoft login configured</div>
            <Field label="Your name" htmlFor="si-name"><Input id="si-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required /></Field>
            <Field label="Work email" htmlFor="si-email"><Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@company.com" required /></Field>
            <Button variant="primary" size="lg" block type="submit" loading={busy === "org"} disabled={!name.trim() || !email.trim()}>Sign in</Button>
          </form>
        ) : (
          <Button variant="primary" size="lg" block onClick={org} loading={busy === "org"}>
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
            Sign in with Microsoft
          </Button>
        )}

        {allowGuest ? (
          <>
            <div className="tp-row tp-muted tp-small" style={{ gap: 12 }}><hr className="tp-divider" style={{ flex: 1, margin: 0 }} />or join as a guest<hr className="tp-divider" style={{ flex: 1, margin: 0 }} /></div>
            <form className="tp-row" onSubmit={(e) => { e.preventDefault(); void guest(); }} style={{ flexWrap: "nowrap" }}>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your display name" aria-label="Guest display name" maxLength={60} />
              <Button type="submit" loading={busy === "guest"} disabled={!guestName.trim()}>Join</Button>
            </form>
          </>
        ) : null}
      </div>
    </Card>
  );
}
