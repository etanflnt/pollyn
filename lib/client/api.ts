"use client";
// Tiny typed fetch wrapper. Owner: orchestrator.
import type { ApiError } from "@/lib/types";

export class ApiRequestError extends Error {
  constructor(public status: number, public body: ApiError) { super(body.error); }
}

// Session token fallback (sent as Bearer) for hosts that block third-party cookies, e.g. Teams web in Safari.
const KEY = "tp-session";
export function setSessionToken(t: string | null) {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
export function authHeaders(): Record<string, string> {
  try { const t = localStorage.getItem(KEY); return t ? { authorization: `Bearer ${t}` } : {}; } catch { return {}; }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: { ...authHeaders(), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let body: ApiError;
    try { body = await res.json(); } catch { body = { error: res.statusText, code: "bad_request" }; }
    throw new ApiRequestError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
