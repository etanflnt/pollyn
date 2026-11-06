import { handle, json } from "@/lib/server/http";
import { getUser } from "@/lib/server/auth";
import { assertCanView, canSeeResults, isOwner, requirePoll } from "@/lib/server/polls";
import { getResponse, listResponses } from "@/lib/server/responses";
import { computeResults } from "@/lib/server/results";
import { forbidden } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/polls/:id/results -> PollResults (403 forbidden when results are not visible yet) */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getUser(req);
  const poll = await requirePoll(id);
  assertCanView(poll, user);
  if (!canSeeResults(poll, user, await getResponse(poll.id, user.id))) {
    throw forbidden("Results are not available to you yet.");
  }
  return json(computeResults(poll, await listResponses(poll.id), { isOwner: isOwner(poll, user) }));
});
