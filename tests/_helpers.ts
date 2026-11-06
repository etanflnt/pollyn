// Shared test fixtures. Every test file runs in its own process, so env set here is per-file.
process.env.TP_DB_PATH = ":memory:";
process.env.DATABASE_URL = ""; // never let tests touch a real database
process.env.POSTGRES_URL = "";
process.env.AZURE_CLIENT_ID = "";
process.env.AZURE_TENANT_ID = "";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
process.env.POLL_CREATORS = "everyone";
process.env.ADMIN_EMAILS = "boss@example.com";

import type { Poll, PollResponse, Question, User } from "../lib/types.ts";
import { DEFAULT_SETTINGS } from "../lib/server/polls.ts";

export const T1 = "11111111-1111-1111-1111-111111111111";
export const T2 = "22222222-2222-2222-2222-222222222222";

export function user(id: string, over: Partial<User> = {}): User {
  return { id, kind: "org", name: id.toUpperCase(), email: `${id}@example.com`, tenantId: T1, isAdmin: false, ...over };
}

export const owner = user("owner");
export const alice = user("alice");
export const bob = user("bob");
export const carol = user("carol");
export const outsider = user("eve", { tenantId: T2 });
export const guest = user("guest_x", { kind: "guest", email: null, tenantId: null });

export function questions(): Question[] {
  return [
    {
      id: "q1", type: "single", title: "Lunch?", required: true, allowSuggestions: true, maxChoices: null,
      options: [{ id: "pizza", label: "Pizza" }, { id: "sushi", label: "Sushi" }, { id: "tacos", label: "Tacos" }],
    },
    {
      id: "q2", type: "multiple", title: "Drinks", required: false, allowSuggestions: false, maxChoices: 2,
      options: [{ id: "tea", label: "Tea" }, { id: "coffee", label: "Coffee" }, { id: "juice", label: "Juice" }],
    },
    { id: "q3", type: "rating", title: "Mood", required: true, allowSuggestions: false, options: [] },
    { id: "q4", type: "text", title: "Anything else?", required: false, allowSuggestions: false, options: [] },
  ];
}

export function poll(over: Partial<Poll> = {}, settings: Partial<Poll["settings"]> = {}): Poll {
  return {
    id: "p1", slug: "abc1234", title: "Team lunch", description: "", cover: null,
    ownerId: owner.id, ownerName: owner.name, tenantId: T1, status: "open",
    settings: { ...DEFAULT_SETTINGS, ...settings }, questions: questions(),
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

let n = 0;
export function response(u: User, answers: PollResponse["answers"], over: Partial<PollResponse> = {}): PollResponse {
  n++;
  const t = new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
  return {
    id: `r${n}`, pollId: "p1", userId: u.id, userName: u.name, answers, currentStep: 5, completed: true,
    startedAt: t, updatedAt: t, completedAt: t, ...over,
  };
}
