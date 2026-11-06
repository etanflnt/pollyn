import { error, handle } from "@/lib/server/http";
import { readUpload } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

/** GET /api/uploads/:name -> image bytes (immutable cache) */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { name } = await params;
  const file = await readUpload(name);
  if (!file) return error("not_found", 404, "Image not found.");
  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});
