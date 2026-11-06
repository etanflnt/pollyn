import { handle, json, readJson } from "@/lib/server/http";
import { recordUser, sessionCookie, signSession, verifyAadToken } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ token?: unknown }>(req, 32 * 1024);
  const user = await verifyAadToken(body.token);
  await recordUser(user);
  const session = await signSession(user);
  return json({ user, session }, 200, { "set-cookie": sessionCookie(req, session) });
});
