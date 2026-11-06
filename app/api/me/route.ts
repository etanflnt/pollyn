import { handle, json } from "@/lib/server/http";
import { getUser, meResponse } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => json(meResponse(await getUser(req))));
