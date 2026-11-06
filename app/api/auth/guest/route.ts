import { handle, json, readJson } from "@/lib/server/http";
import { getUser, makeGuestUser, recordUser, sessionCookie, signSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const fresh = makeGuestUser(await readJson(req, 8 * 1024));
  // Signing in again as a guest keeps the same guest id, so an unfinished vote can be resumed.
  const current = await getUser(req);
  const user = current?.kind === "guest" ? { ...fresh, id: current.id } : fresh;
  await recordUser(user);
  const session = await signSession(user);
  return json({ user, session }, 200, { "set-cookie": sessionCookie(req, session) });
});
