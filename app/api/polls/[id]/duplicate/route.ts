import { handle, json } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertOwner, duplicatePoll, requirePoll } from "@/lib/server/polls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/polls/:id/duplicate (owner) -> Poll (new draft) */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser(req);
  const poll = await requirePoll(id);
  assertOwner(poll, user);
  return json(await duplicatePoll(poll, user), 201);
});
