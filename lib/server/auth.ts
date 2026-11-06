// Sessions (tp_session HS256 JWT cookie), AAD token verification, dev/guest users. Owner: Linus.
// Framework-free: works on standard Request objects so it is unit-testable.
import { SignJWT, jwtVerify, createRemoteJWKSet, decodeJwt, type JWTPayload } from "jose";
import type { AppConfig, MeResponse, User, UserKind } from "../types.ts";
import { newId } from "../ids.ts";
import { getEnv, type ServerEnv } from "./env.ts";
import { nowIso, query } from "./db.ts";
import { badRequest, forbidden, unauthenticated, wrongTenant } from "./errors.ts";

export const SESSION_COOKIE = "tp_session";
const SESSION_DAYS = 30;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const NAME_MAX = 80;
const EMAIL_MAX = 254;

const secretKey = (env: ServerEnv) => new TextEncoder().encode(env.sessionSecret);

export function isAdminEmail(email: string | null | undefined, env: ServerEnv = getEnv()): boolean {
  return !!email && env.adminEmails.includes(email.trim().toLowerCase());
}

export function canCreate(user: User | null, env: ServerEnv = getEnv()): boolean {
  if (!user || user.kind === "guest") return false;
  return env.pollCreators !== "admins" || isAdminEmail(user.email, env);
}

export function appConfig(env: ServerEnv = getEnv()): AppConfig {
  return {
    authMode: env.devMode ? "dev" : "teams",
    clientId: env.devMode ? null : env.clientId,
    tenantId: env.tenantId || null,
    baseUrl: env.baseUrl,
  };
}

export function meResponse(user: User | null, env: ServerEnv = getEnv()): MeResponse {
  return { user, canCreate: canCreate(user, env), config: appConfig(env) };
}

/* ---------------- names ---------------- */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

export function cleanName(raw: unknown, max = NAME_MAX): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "user";
}

/* ---------------- session JWT ---------------- */
export async function signSession(user: User, env: ServerEnv = getEnv()): Promise<string> {
  const rest = { id: user.id, kind: user.kind, name: user.name, email: user.email, tenantId: user.tenantId };
  return new SignJWT({ u: rest })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey(env));
}

export async function verifySession(token: string, env: ServerEnv = getEnv()): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env), { algorithms: ["HS256"] });
    const u = (payload as JWTPayload & { u?: Partial<User> }).u;
    if (!u || typeof u.id !== "string" || typeof u.name !== "string") return null;
    const kind = u.kind as UserKind;
    if (kind !== "org" && kind !== "guest" && kind !== "dev") return null;
    // A dev session must not survive switching the app into real (teams) auth.
    if (kind === "dev" && !env.devMode) return null;
    const email = typeof u.email === "string" ? u.email : null;
    return {
      id: u.id,
      kind,
      name: u.name,
      email,
      tenantId: typeof u.tenantId === "string" ? u.tenantId : null,
      isAdmin: kind !== "guest" && isAdminEmail(email, env),
    };
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/** The signed-in user for this request, or null. */
export async function getUser(req: Request): Promise<User | null> {
  // Cookie first; Bearer fallback for hosts that block third-party cookies (Teams web/Safari iframes).
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const token = readCookie(req, SESSION_COOKIE) ?? bearer;
  if (!token) return null;
  return verifySession(token);
}

export async function requireUser(req: Request): Promise<User> {
  const u = await getUser(req);
  if (!u) throw unauthenticated();
  return u;
}

export function isHttps(req: Request): boolean {
  const xf = req.headers.get("x-forwarded-proto");
  if (xf) return xf.split(",")[0].trim().toLowerCase() === "https";
  try { return new URL(req.url).protocol === "https:"; } catch { return false; }
}

/** Set-Cookie header value. Teams loads us in a cross-site iframe, so https needs SameSite=None; Secure. */
export function sessionCookie(req: Request, token: string | null): string {
  const attrs = [
    `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ""}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${token ? SESSION_SECONDS : 0}`,
  ];
  if (!token) attrs.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (isHttps(req)) attrs.push("SameSite=None", "Secure");
  else attrs.push("SameSite=Lax");
  return attrs.join("; ");
}

/* ---------------- user records ---------------- */
export async function recordUser(user: User): Promise<void> {
  const now = nowIso();
  await query(
    `INSERT INTO users (id, kind, name, email, tenant_id, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, email = excluded.email,
       tenant_id = excluded.tenant_id, last_seen_at = excluded.last_seen_at`,
    [user.id, user.kind, user.name, user.email, user.tenantId, now, now],
  );
}

/* ---------------- dev + guest sign-in ---------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function makeDevUser(body: unknown, env: ServerEnv = getEnv()): User {
  if (!env.devMode) throw forbidden("Dev sign-in is disabled when Microsoft sign-in is configured.");
  const b = (body ?? {}) as { name?: unknown; email?: unknown };
  const name = cleanName(b.name);
  const email = cleanName(b.email, EMAIL_MAX).toLowerCase();
  if (!name) throw badRequest("Name is required.");
  if (!EMAIL_RE.test(email)) throw badRequest("A valid email is required.");
  return { id: "dev_" + slugify(email), kind: "dev", name, email, tenantId: "dev-org", isAdmin: isAdminEmail(email, env) };
}

export function makeGuestUser(body: unknown): User {
  const name = cleanName((body as { name?: unknown } | null)?.name);
  if (!name) throw badRequest("Name is required.");
  return { id: "guest_" + newId(), kind: "guest", name, email: null, tenantId: null, isAdmin: false };
}

/* ---------------- AAD (Teams SSO / MSAL) ---------------- */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(tid: string) {
  let set = jwksCache.get(tid);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`));
    jwksCache.set(tid, set);
  }
  return set;
}

export function aadAudiences(env: ServerEnv): string[] {
  let host = "";
  try { host = new URL(env.baseUrl).host; } catch { /* ignore */ }
  return [host ? `api://${host}/${env.clientId}` : "", env.clientId].filter(Boolean);
}

/** Verify an AAD access token (v1 or v2) and map it to an org User. */
export async function verifyAadToken(token: unknown, env: ServerEnv = getEnv()): Promise<User> {
  if (env.devMode) throw forbidden("Microsoft sign-in is not configured (dev mode).");
  if (typeof token !== "string" || token.length < 20 || token.length > 16384) throw badRequest("Missing token.");
  let tid: string;
  try {
    tid = String(decodeJwt(token).tid ?? "");
  } catch {
    throw unauthenticated("Invalid token.");
  }
  if (!GUID_RE.test(tid)) throw unauthenticated("Invalid token tenant.");
  if (env.tenantId && tid.toLowerCase() !== env.tenantId.toLowerCase()) {
    throw wrongTenant("This app is restricted to a different organisation.");
  }
  let payload: JWTPayload & Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, jwksFor(tid), {
      audience: aadAudiences(env),
      issuer: [`https://login.microsoftonline.com/${tid}/v2.0`, `https://sts.windows.net/${tid}/`],
      algorithms: ["RS256"],
      clockTolerance: 60,
    }));
  } catch (e) {
    throw unauthenticated(`Token verification failed: ${(e as Error).message}`);
  }
  const oid = typeof payload.oid === "string" ? payload.oid : "";
  if (!oid) throw unauthenticated("Token has no user id (oid).");
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = payload[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const email = pick("preferred_username", "upn", "email", "unique_name");
  const name = cleanName(pick("name") ?? email ?? "Teams user") || "Teams user";
  return {
    id: oid,
    kind: "org",
    name,
    email: email ? email.toLowerCase().slice(0, EMAIL_MAX) : null,
    tenantId: tid,
    isAdmin: isAdminEmail(email, env),
  };
}
