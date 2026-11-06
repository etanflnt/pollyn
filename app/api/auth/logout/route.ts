import { handle, noContent } from "@/lib/server/http";
import { sessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => noContent({ "set-cookie": sessionCookie(req, null) }));
