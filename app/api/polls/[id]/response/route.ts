import { handle, json, readJson } from "@/lib/server/http";
import { getUser } from "@/lib/server/auth";
import { assertCanVote, requirePoll } from "@/lib/server/polls";
import { upsertResponse } from "@/lib/server/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/polls/:id/response  ResponseInput -> PollResponse (upsert by user) */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getUser(req);
  const poll = await requirePoll(id);
  assertCanVote(poll, user);
  return json(await upsertResponse(poll, user, await readJson(req)));
});
