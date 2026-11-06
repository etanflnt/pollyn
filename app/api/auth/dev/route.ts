import { handle, json, readJson } from "@/lib/server/http";
import { makeDevUser, recordUser, sessionCookie, signSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const user = makeDevUser(await readJson(req, 8 * 1024));
  await recordUser(user);
  const session = await signSession(user);
  return json({ user, session }, 200, { "set-cookie": sessionCookie(req, session) });
});
