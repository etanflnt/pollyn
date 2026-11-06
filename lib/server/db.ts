// Async Postgres adapter. Owner: Linus.
//  - DATABASE_URL set (Vercel + Neon): postgres.js over the pooled URL ({ prepare: false, max: 1 }).
//  - otherwise (local dev, tests): PGlite (Postgres compiled to WASM, in-process), persisted to
//    data/pglite, or in memory when TP_DB_PATH=":memory:". Same SQL on both.
// Queries use $1..$n parameters. Inside tx(fn) every query() call made by fn (however deep) runs on
// the transaction's connection, carried by AsyncLocalStorage, so helpers need no client argument.
import { AsyncLocalStorage } from "node:async_hooks";
import { getEnv } from "./env.ts";

export type Row = Record<string, unknown>;

interface Client {
  query(text: string, params: unknown[]): Promise<Row[]>;
}

interface Backend extends Client {
  kind: "postgres" | "pglite";
  key: string;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const txStore = new AsyncLocalStorage<Client>();

const g = globalThis as unknown as { __pollynDb?: { key: string; ready: Promise<Backend> } };

/* ---------------- schema ---------------- */

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     name TEXT NOT NULL,
     email TEXT,
     tenant_id TEXT,
     created_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS polls (
     id TEXT PRIMARY KEY,
     slug TEXT NOT NULL UNIQUE,
     owner_id TEXT NOT NULL,
     owner_name TEXT NOT NULL,
     tenant_id TEXT,
     status TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT NOT NULL,
     cover TEXT,
     settings TEXT NOT NULL,
     questions TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS polls_owner ON polls (owner_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS responses (
     id TEXT PRIMARY KEY,
     poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL,
     user_name TEXT NOT NULL,
     answers TEXT NOT NULL,
     current_step INTEGER NOT NULL,
     completed BOOLEAN NOT NULL,
     started_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     completed_at TEXT,
     UNIQUE (poll_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS draws (
     seq BIGINT GENERATED ALWAYS AS IDENTITY,
     id TEXT PRIMARY KEY,
     poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
     game TEXT NOT NULL,
     source TEXT NOT NULL,
     entries TEXT NOT NULL,
     winners TEXT NOT NULL,
     created_by TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS draws_poll ON draws (poll_id, seq)`,
  `CREATE TABLE IF NOT EXISTS uploads (
     name TEXT PRIMARY KEY,
     content_type TEXT NOT NULL,
     size INTEGER NOT NULL,
     bytes BYTEA NOT NULL,
     created_by TEXT,
     created_at TEXT NOT NULL
   )`,
];

async function migrate(b: Backend): Promise<void> {
  // The advisory lock stops two cold-starting serverless instances racing on CREATE TABLE.
  await b.tx(async () => {
    await query("SELECT pg_advisory_xact_lock(7240117)");
    for (const stmt of SCHEMA) await query(stmt);
  });
}

/* ---------------- backends ---------------- */

async function openPostgres(url: string): Promise<Backend> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    prepare: false,        // Neon pooler (PgBouncer, transaction mode)
    max: 1,                // one connection per serverless instance
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  const run = (s: { unsafe: typeof sql.unsafe }) => async (text: string, params: unknown[]): Promise<Row[]> => {
    const rows = await s.unsafe(text, params as never[]);
    return Array.from(rows, (r) => ({ ...(r as Row) }));
  };
  const base = run(sql);
  return {
    kind: "postgres",
    key: url,
    query: base,
    tx: async <T>(fn: () => Promise<T>) =>
      (await sql.begin((t) => txStore.run({ query: run(t) }, fn))) as T,
    close: () => sql.end({ timeout: 5 }),
  };
}

async function openPglite(dataDir: string | undefined): Promise<Backend> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const db = await PGlite.create(dataDir);
  const plain = (rows: unknown[]) => rows.map((r) => ({ ...(r as Row) }));
  return {
    kind: "pglite",
    key: dataDir ?? ":memory:",
    query: async (text, params) => plain((await db.query(text, params)).rows),
    tx: <T>(fn: () => Promise<T>) =>
      db.transaction((t) => txStore.run({ query: async (text, params) => plain((await t.query(text, params)).rows) }, fn)),
    close: () => db.close(),
  };
}

function backendKey(): { key: string; open: () => Promise<Backend> } {
  const env = getEnv();
  if (env.databaseUrl) return { key: "pg:" + env.databaseUrl, open: () => openPostgres(env.databaseUrl) };
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. On Vercel, add a Neon Postgres database (Storage tab) so DATABASE_URL is provided.");
  }
  const dir = env.dbPath === ":memory:" ? undefined : env.dbPath;
  return { key: "pglite:" + (dir ?? ":memory:"), open: () => openPglite(dir) };
}

/** The ready (migrated) backend, opened once per process and cached on globalThis (survives Next HMR). */
function backend(): Promise<Backend> {
  const { key, open } = backendKey();
  if (g.__pollynDb && g.__pollynDb.key === key) return g.__pollynDb.ready;
  const ready = (async () => {
    const b = await open();
    await migrate(b);
    return b;
  })();
  g.__pollynDb = { key, ready };
  ready.catch(() => { if (g.__pollynDb?.ready === ready) g.__pollynDb = undefined; });
  return ready;
}

/* ---------------- public API ---------------- */

/** Run a parameterised query ($1..$n). Uses the current transaction when called inside tx(). */
export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const inTx = txStore.getStore();
  if (inTx) return (await inTx.query(text, params)) as T[];
  const b = await backend();
  return (await b.query(text, params)) as T[];
}

export async function queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run fn in a transaction (nested calls reuse the outer one). Throwing rolls back. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const b = await backend();
  return b.tx(fn);
}

/** Which backend is active ("postgres" | "pglite"). */
export async function dbKind(): Promise<Backend["kind"]> {
  return (await backend()).kind;
}

/** Tests/tools: close the connection so the next query opens a fresh database. */
export async function closeDb(): Promise<void> {
  const cur = g.__pollynDb;
  g.__pollynDb = undefined;
  if (cur) {
    try { await (await cur.ready).close(); } catch { /* ignore */ }
  }
}

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const nowIso = () => new Date().toISOString();
