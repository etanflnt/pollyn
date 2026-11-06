// Health check: is the database reachable? Never returns secrets (connection strings are redacted).
import { dbKind, queryOne } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redact = (s: string) => s.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://***");

export async function GET() {
  const env = getEnv();
  const info = { databaseUrlSet: Boolean(env.databaseUrl), onVercel: Boolean(process.env.VERCEL) };
  try {
    const kind = await dbKind();
    const row = await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM polls");
    return Response.json({ ok: true, db: kind, polls: row?.n ?? 0, ...info });
  } catch (e) {
    const err = e as Error & { code?: string };
    return Response.json({ ok: false, ...info, error: redact(`${err.name}: ${err.message}`), code: err.code ?? null }, { status: 503 });
  }
}
