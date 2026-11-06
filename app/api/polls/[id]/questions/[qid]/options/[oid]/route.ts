import { handle, noContent } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertOwner, requirePoll } from "@/lib/server/polls";
import { deleteOption } from "@/lib/server/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; qid: string; oid: string }> };

/** DELETE /api/polls/:id/questions/:qid/options/:oid (owner) -> 204; also strips the option from answers */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { id, qid, oid } = await params;
  const user = await requireUser(req);
  const poll = await requirePoll(id);
  assertOwner(poll, user);
  await deleteOption(poll, qid, oid);
  return noContent();
});
