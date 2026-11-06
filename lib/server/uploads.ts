// Image uploads stored in Postgres (no filesystem on Vercel), served at /api/uploads/<32hex>.<ext>. Owner: Linus.
import { randomBytes } from "node:crypto";
import { nowIso, queryOne } from "./db.ts";
import { badRequest } from "./errors.ts";

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // Vercel's request body limit is 4.5 MB
export const UPLOAD_NAME_RE = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;

export type ImageExt = "png" | "jpg" | "gif" | "webp";
export const CONTENT_TYPES: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Detect the image type from magic bytes (never trust the client's content-type). */
export function sniffImage(b: Uint8Array): ImageExt | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** Validate + store an image; returns its file name (use `/api/uploads/<name>`). */
export async function saveUpload(bytes: Uint8Array, createdBy: string | null = null): Promise<string> {
  if (bytes.length === 0) throw badRequest("The file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("Images must be 3 MB or smaller.");
  const ext = sniffImage(bytes);
  if (!ext) throw badRequest("Only PNG, JPG, GIF or WebP images are allowed.");
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await queryOne(
    "INSERT INTO uploads (name, content_type, size, bytes, created_by, created_at) VALUES ($1, $2, $3, $4::bytea, $5, $6)",
    [name, CONTENT_TYPES[ext], bytes.length, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), createdBy, nowIso()],
  );
  return name;
}

function toBytes(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v; // Buffer (postgres.js) and Uint8Array (PGlite)
  if (typeof v === "string" && v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
  return null;
}

/** Returns bytes + content type, or null if the name is invalid or unknown. */
export async function readUpload(name: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!UPLOAD_NAME_RE.test(name)) return null; // also blocks any path tricks
  const row = await queryOne("SELECT content_type, bytes FROM uploads WHERE name = $1", [name]);
  const bytes = row ? toBytes(row.bytes) : null;
  if (!row || !bytes) return null;
  return { bytes, contentType: String(row.content_type) };
}
