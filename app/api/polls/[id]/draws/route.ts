import { handle, json, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { assertOwner, requirePoll } from "@/lib/server/polls";
import { listResponses } from "@/lib/server/responses";
import { createDraw, listDraws } from "@/lib/server/draws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/polls/:id/draws (owner) -> Draw[] newest first */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser(req);
  const poll = await requirePoll(id);
  assertOwner(poll, user);
  return json(await listDraws(poll.id));
});

/** POST /api/polls/:id/draws (owner) DrawInput -> Draw */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser(req);
  const poll = await requirePoll(id);
  assertOwner(poll, user);
  const body = await readJson(req, 256 * 1024);
  return json(await createDraw(poll, await listResponses(poll.id), body, user), 201);
});
