import { handle, json, noContent, readJson } from "@/lib/server/http";
import { getUser, requireUser } from "@/lib/server/auth";
import {
  assertCanView, assertOwner, buildPollView, deletePoll, requirePoll, updatePoll, withEffectiveStatus,
} from "@/lib/server/polls";
import { getResponse } from "@/lib/server/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/polls/:idOrSlug -> PollView */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getUser(req);
  const poll = await requirePoll(id);
  assertCanView(poll, user);
  return json(await buildPollView(poll, user, await getResponse(poll.id, user.id)));
});

/** PATCH /api/polls/:id (owner) Partial<PollInput> -> Poll */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser(req);
  const poll = await requirePoll(id);
  assertOwner(poll, user);
  return json(withEffectiveStatus(await updatePoll(poll, await readJson(req))));
});

/** DELETE /api/polls/:id (owner) -> 204, cascades responses + draws */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser(req);
  const poll = await requirePoll(id);
  assertOwner(poll, user);
  await deletePoll(poll.id);
  return noContent();
});
