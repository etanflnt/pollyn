import { handle, json } from "@/lib/server/http";
import { canCreate, requireUser } from "@/lib/server/auth";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/lib/server/uploads";
import { HttpError, badRequest, forbidden } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/uploads (canCreate) multipart `file` -> { url } */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (!canCreate(user)) throw forbidden("Only poll creators can upload images.");
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "bad_request", "Images must be 3 MB or smaller.");
  let form: FormData;
  try { form = await req.formData(); } catch { throw badRequest("Send the image as multipart/form-data in a `file` field."); }
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Missing `file`.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "bad_request", "Images must be 3 MB or smaller.");
  const name = await saveUpload(new Uint8Array(await file.arrayBuffer()), user.id);
  return json({ url: `/api/uploads/${name}` }, 201);
});
