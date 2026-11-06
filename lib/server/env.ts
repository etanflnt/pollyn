// Server environment, read lazily so tests can tweak process.env. Owner: Linus.
import path from "node:path";

const DEV_SECRET = "pollyn-dev-only-session-secret-do-not-use-in-production";
const PLACEHOLDER_SECRET = "change-me-to-a-long-random-string";
let warnedSecret = false;

export interface ServerEnv {
  clientId: string;          // "" in dev mode
  tenantId: string;          // "" = any tenant
  baseUrl: string;
  devMode: boolean;
  sessionSecret: string;
  pollCreators: "everyone" | "admins";
  adminEmails: string[];     // lower-cased
  /** Postgres connection string (Neon pooled URL on Vercel). Empty = use PGlite locally. */
  databaseUrl: string;
  /** PGlite data directory, or ":memory:" (tests). Ignored when databaseUrl is set. */
  dbPath: string;
}

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : fallback;
}

/** APP_BASE_URL, else the Vercel production domain, else the deployment URL, else localhost. */
function baseUrl(): string {
  const explicit = str("APP_BASE_URL");
  const host = str("VERCEL_PROJECT_PRODUCTION_URL") || str("VERCEL_URL");
  const url = explicit || (host ? (/^https?:\/\//.test(host) ? host : `https://${host}`) : "http://localhost:3200");
  return url.replace(/\/+$/, "");
}

export function getEnv(): ServerEnv {
  const clientId = str("AZURE_CLIENT_ID");
  const devMode = clientId === "";
  let sessionSecret = str("SESSION_SECRET");
  if (!sessionSecret || sessionSecret === PLACEHOLDER_SECRET) {
    if (!devMode) {
      throw new Error("SESSION_SECRET must be set to a long random string when AZURE_CLIENT_ID is configured.");
    }
    if (!warnedSecret) {
      warnedSecret = true;
      console.warn("[pollyn] SESSION_SECRET not set: using an insecure dev-only secret (dev mode).");
    }
    sessionSecret = DEV_SECRET;
  }
  const cwd = process.cwd();
  return {
    clientId,
    tenantId: str("AZURE_TENANT_ID"),
    baseUrl: baseUrl(),
    devMode,
    sessionSecret,
    pollCreators: str("POLL_CREATORS").toLowerCase() === "admins" ? "admins" : "everyone",
    adminEmails: str("ADMIN_EMAILS").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    databaseUrl: str("DATABASE_URL") || str("POSTGRES_URL"),
    dbPath: str("TP_DB_PATH") || path.join(cwd, "data", "pglite"),
  };
}
