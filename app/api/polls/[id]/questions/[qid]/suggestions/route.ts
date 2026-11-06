import { handle, json, readJson } from "@/lib/server/http";
import { getUser } from "@/lib/server/auth";
import { assertCanVote, requirePoll } from "@/lib/server/polls";
import { addSuggestion } from "@/lib/server/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; qid: string }> };

/** POST /api/polls/:id/questions/:qid/suggestions  {label} -> Option (existing one if duplicate) */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id, qid } = await params;
  const user = await getUser(req);
  const poll = await requirePoll(id);
  assertCanVote(poll, user);
  const body = await readJson<{ label?: unknown }>(req, 8 * 1024);
  return json(await addSuggestion(poll.id, qid, body.label, user));
});
