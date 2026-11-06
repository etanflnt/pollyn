"use client";
// Client auth: Teams SSO (inside Teams) -> MSAL popup (browser, org mode) -> dev / guest sign-in.
// Owner: orchestrator. Server side lives in lib/server/auth.ts + app/api/auth/*.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MeResponse, User } from "@/lib/types";
import { api, setSessionToken } from "./api";

type AuthResult = { user: User; session?: string };
function keep(r: AuthResult): User { if (r.session) setSessionToken(r.session); return r.user; }

let teamsReady: Promise<boolean> | null = null;
/** Resolves true when running inside a Teams/M365 host. Safe to call many times. */
export function detectTeams(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (teamsReady) return teamsReady;
  const framed = window.self !== window.top;
  const ua = navigator.userAgent.includes("Teams/");
  if (!framed && !ua) return (teamsReady = Promise.resolve(false));
  teamsReady = (async () => {
    try {
      const { app } = await import("@microsoft/teams-js");
      await Promise.race([app.initialize(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500))]);
      app.notifySuccess?.();
      return true;
    } catch { return false; }
  })();
  return teamsReady;
}

async function teamsToken(): Promise<string> {
  const { authentication } = await import("@microsoft/teams-js");
  return authentication.getAuthToken();
}

async function msalToken(clientId: string, tenantId: string | null, baseUrl: string): Promise<string> {
  const { PublicClientApplication, InteractionRequiredAuthError } = await import("@azure/msal-browser");
  const pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId || "organizations"}`,
      redirectUri: `${window.location.origin}/auth/blank`,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await pca.initialize();
  const host = new URL(baseUrl).host;
  const scopes = [`api://${host}/${clientId}/access_as_user`];
  const account = pca.getAllAccounts()[0];
  if (account) {
    try { return (await pca.acquireTokenSilent({ scopes, account })).accessToken; }
    catch (e) { if (!(e instanceof InteractionRequiredAuthError)) { /* fall through to popup */ } }
  }
  const res = await pca.loginPopup({ scopes, prompt: "select_account" });
  return res.accessToken;
}

interface AuthCtx {
  me: MeResponse | null;
  user: User | null;
  loading: boolean;
  inTeams: boolean;
  /** Org sign-in: Teams SSO, else MSAL popup. In dev mode pass {name,email}. */
  signInOrg: (dev?: { name: string; email: string }) => Promise<User>;
  /** Guest sign-in for public polls. */
  signInGuest: (name: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [inTeams, setInTeams] = useState(false);

  const refresh = useCallback(async () => {
    const r = await api<MeResponse>("/api/me");
    setMe(r);
  }, []);

  const signInOrg = useCallback(async (dev?: { name: string; email: string }) => {
    const cfg = me?.config ?? (await api<MeResponse>("/api/me")).config;
    let user: User;
    if (cfg.authMode === "dev") {
      if (!dev) throw new Error("Enter a name and email to sign in (dev mode).");
      user = keep(await api<AuthResult>("/api/auth/dev", { method: "POST", json: dev }));
    } else {
      const token = (await detectTeams()) ? await teamsToken() : await msalToken(cfg.clientId!, cfg.tenantId, cfg.baseUrl);
      user = keep(await api<AuthResult>("/api/auth/teams", { method: "POST", json: { token } }));
    }
    await refresh();
    return user;
  }, [me, refresh]);

  const signInGuest = useCallback(async (name: string) => {
    const user = keep(await api<AuthResult>("/api/auth/guest", { method: "POST", json: { name } }));
    await refresh();
    return user;
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setSessionToken(null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, teams] = await Promise.all([api<MeResponse>("/api/me"), detectTeams()]);
        if (!alive) return;
        setMe(r); setInTeams(teams);
        // Inside Teams: sign in silently with SSO so users never see a login screen.
        if (teams && r.config.authMode === "teams" && (!r.user || r.user.kind !== "org")) {
          try {
            const token = await teamsToken();
            keep(await api<AuthResult>("/api/auth/teams", { method: "POST", json: { token } }));
            const r2 = await api<MeResponse>("/api/me");
            if (alive) setMe(r2);
          } catch { /* user can retry from the sign-in card */ }
        }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const value = useMemo<AuthCtx>(() => ({ me, user: me?.user ?? null, loading, inTeams, signInOrg, signInGuest, signOut, refresh }),
    [me, loading, inTeams, signInOrg, signInGuest, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
