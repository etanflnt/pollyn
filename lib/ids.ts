// Shared id helpers (client + server). Owner: orchestrator.
const ALPHA = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars

function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHA[b % ALPHA.length];
  return s;
}

/** Short unique id for polls/questions/options/responses. */
export function newId(prefix = ""): string {
  return prefix + randomString(12);
}

/** Share code used in /p/<slug>. */
export function newSlug(): string {
  return randomString(7);
}
