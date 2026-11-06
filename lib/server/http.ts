// Response helpers for route handlers. Owner: Linus.
import type { ApiError } from "../types.ts";
import { HttpError, badRequest } from "./errors.ts";
import { getEnv } from "./env.ts";

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  if (!h.has("cache-control")) h.set("cache-control", NO_STORE["cache-control"]);
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function noContent(headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("cache-control", "no-store");
  return new Response(null, { status: 204, headers: h });
}

export function error(code: ApiError["code"], status: number, msg: string): Response {
  const body: ApiError = { error: msg, code };
  return json(body, status);
}

/** Read a JSON object body with a size cap (default 512 KB). */
export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 512 * 1024): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "bad_request", "Request body too large.");
  let text: string;
  try { text = await req.text(); } catch { throw badRequest("Could not read request body."); }
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, "bad_request", "Request body too large.");
  if (!text.trim()) return {} as T;
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) throw badRequest("Send JSON with content-type: application/json.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw badRequest("Body must be valid JSON."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw badRequest("Body must be a JSON object.");
  return data as T;
}

/**
 * CSRF guard for state-changing requests: the session cookie is SameSite=None on https (Teams iframe),
 * so reject requests whose Origin is a different host than ours.
 */
export function assertSameOrigin(req: Request): void {
  const m = req.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return; // same-origin fetches from older clients / server-side callers
  let originHost: string;
  try { originHost = new URL(origin).host.toLowerCase(); } catch { throw new HttpError(403, "forbidden", "Bad origin."); }
  const allowed = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host.split(",")[0].trim().toLowerCase());
  try { allowed.add(new URL(req.url).host.toLowerCase()); } catch { /* ignore */ }
  try { allowed.add(new URL(getEnv().baseUrl).host.toLowerCase()); } catch { /* ignore */ }
  if (!allowed.has(originHost)) throw new HttpError(403, "forbidden", "Cross-site request blocked.");
}

/** Wrap a handler: HttpError -> JSON error, anything else -> 500. Also applies the CSRF origin check. */
export function handle<A extends [Request, ...unknown[]]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      assertSameOrigin(args[0]);
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return error(e.code, e.status, e.message);
      console.error("[pollyn] unhandled API error", e);
      return error("bad_request", 500, "Something went wrong on our side.");
    }
  };
}
