import { handle, json, readJson } from "@/lib/server/http";
import { canCreate, requireUser } from "@/lib/server/auth";
import { createPoll, listMyPolls } from "@/lib/server/polls";
import { forbidden } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => json(await listMyPolls(await requireUser(req))));

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (!canCreate(user)) {
    throw forbidden(user.kind === "guest" ? "Guests can vote but cannot create polls." : "Only admins can create polls.");
  }
  return json(await createPoll(await readJson(req), user), 201);
});
