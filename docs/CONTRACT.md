# TeamsPoll ("Pollyn") — API & page contract (MVP)

Types: `lib/types.ts` (source of truth). Stack: Next.js 16 App Router + React 19, TypeScript, plain CSS (FLNT tokens in `app/tokens.css`, classes in `app/globals.css`, kit in `components/ui`). DB: Postgres via `postgres` (postgres.js) when `DATABASE_URL` is set (Neon on Vercel), else embedded PGlite in `data/pglite`; images are stored in the `uploads` table. Dev server: `npm run dev` → http://localhost:3200.

## Auth model
- Session = HttpOnly cookie `tp_session` (HS256 JWT signed with `SESSION_SECRET`, 30 days, `SameSite=None; Secure` when https else `Lax`) containing the `User`.
- **teams mode** (`AZURE_CLIENT_ID` set): client sends an AAD access token (Teams SSO `getAuthToken()` or MSAL popup). Server verifies with `jose` against `https://login.microsoftonline.com/{tid}/discovery/v2.0/keys`; audience = `api://<host of APP_BASE_URL>/<clientId>` or `<clientId>`; issuer = `https://login.microsoftonline.com/{tid}/v2.0` or `https://sts.windows.net/{tid}/`; if `AZURE_TENANT_ID` set, `tid` must match. User = `{ id: oid, kind: "org", name, email: preferred_username|upn, tenantId: tid }`.
- **dev mode** (no client id): `/api/auth/dev` with name+email → `{ id: "dev_"+slug(email), kind: "dev", tenantId: "dev-org" }`. Dev users are treated as org members.
- **guest**: `/api/auth/guest` with name → `{ id: "guest_"+rand, kind: "guest", tenantId: null }`. Guests may only vote on `access: "public"` polls; they can never create.
- `isAdmin` = email in `ADMIN_EMAILS` (comma list, case-insensitive). `canCreate` = signed in, not guest, and (`POLL_CREATORS` != "admins" or isAdmin).

## Access rules
- `org` poll: voter must be signed in with `kind !== "guest"` and `tenantId === poll.tenantId` → else 403 `wrong_tenant` / 401 `unauthenticated`.
- `public` poll: any signed-in user incl. guest (401 if no session at all — client then shows SignInCard with guest option).
- `draft` polls: owner only (404 for others). `closed` (or `closesAt` past → treat as closed): readable, responses rejected with 409 `closed`.
- `canSeeResults`: owner always; else by `resultsVisibility`: `always` → true; `after_vote` → my response completed; `after_close` → status closed; `owner_only` → false.
- Names in results: `anonymous` → never (null). Else owner gets names; voters get names only if `showVoterNames`.
- Counts for voters: if `!showVoteCounts` and not owner → `participantCount: null`, and results (if visible) still return counts per option (counts are the result itself) but `started/completed` are 0. Keep it simple.

## Endpoints (all JSON; errors `{error, code}` with 400/401/403/404/409)
| Method | Path | Who | Body → Response |
|---|---|---|---|
| GET | `/api/me` | any | → `MeResponse` |
| POST | `/api/auth/teams` | any | `{token}` → `{user}` + cookie |
| POST | `/api/auth/dev` | dev mode only | `{name,email}` → `{user}` |
| POST | `/api/auth/guest` | any | `{name}` → `{user}` |
| POST | `/api/auth/logout` | any | → 204, clears cookie |
| GET | `/api/polls` | signed-in | → `PollSummary[]` (polls I own, newest first) |
| POST | `/api/polls` | canCreate | `PollInput` → `Poll` (server sets id, slug, owner, tenantId, defaults; default status `draft`) |
| GET | `/api/polls/:idOrSlug` | see access | → `PollView` |
| PATCH | `/api/polls/:id` | owner | `Partial<PollInput>` → `Poll` (settings merged shallowly) |
| DELETE | `/api/polls/:id` | owner | → 204 (cascade responses, draws) |
| POST | `/api/polls/:id/duplicate` | owner | → `Poll` (new draft copy) |
| PUT | `/api/polls/:id/response` | voter | `ResponseInput` → `PollResponse` (upsert by user; validates option ids, required questions when `completed`; a completed response may be edited until close) |
| POST | `/api/polls/:id/questions/:qid/suggestions` | voter, question.allowSuggestions | `{label}` → `Option` (dedupe case-insensitive; returns existing if duplicate; max 60 chars) |
| DELETE | `/api/polls/:id/questions/:qid/options/:oid` | owner | → 204 (also strips that option from answers) |
| GET | `/api/polls/:id/results` | canSeeResults | → `PollResults` |
| GET | `/api/polls/:id/draws` | owner | → `Draw[]` newest first |
| POST | `/api/polls/:id/draws` | owner | `DrawInput` → `Draw` |
| POST | `/api/uploads` | canCreate | multipart `file` (png/jpg/gif/webp, ≤ 3 MB) → `{url: "/api/uploads/<name>"}` |
| GET | `/api/uploads/:name` | any | image bytes, long cache |

Draw entry building (server): `participants` → each completed response = 1 ticket (+1 per option they suggested if `bonusForSuggestions`), label = userName (if anonymous: "Voter #n"); `options` → options of `questionId` with weight = max(1, votes); `custom` → given entries (trim, drop empty, weight clamp 1..100). Winners: weighted, no repeats, `crypto.randomInt`. Max 500 entries.

## Pages
| Route | Owner | What |
|---|---|---|
| `/` | Leonardo | Landing/dashboard: hero + "New poll", my polls grid (status badge, started/completed, quick actions: share, results, games, edit). Signed out → SignInCard. Guests → explain they can only vote. |
| `/create`, `/polls/[id]/edit` | Leonardo | Step-by-step **builder**: 1 Basics (title, description, cover image/video) → 2 Questions (add/reorder/duplicate/delete; type picker single/multiple/rating/text; options with optional image; question media image/video; required; allowSuggestions; maxChoices) → 3 Settings (access org/public, results visibility, show vote counts, show voter names, anonymous, close date, theme) → 4 Preview & Publish (share link copy, QR optional, "Open in Teams" deep link not needed). Autosaves draft via PATCH (debounced). |
| `/p/[slug]` | Ada | **Voter flow**: intro card → one question per step with slide transitions → review → submit → thank-you with confetti + results (if visible). Autosaves `PUT response` on every step change, resumes at `currentStep` ("Welcome back — you stopped at question 3"). Suggest-an-option inline. Mobile first, big tap targets, keyboard (Enter = next). |
| `/polls/[id]/results` | Ada | Live results for owner (and voters when allowed): animated bars, rating avg/distribution, text answers wall, voter names chips, funnel/drop-off by step (owner), auto-refresh every 4s, live badge. |
| `/polls/[id]/games` | Woz | **Randomiser arcade**: tabs Spinner wheel · Raffle draw · Entry count (weighted tickets board). Entry source picker (participants / a question's options / custom list). Calls POST draws, animates to the server-chosen winner, confetti, history list. |

Shared client code: `lib/client/api.ts` (`api<T>()`), `lib/client/auth.tsx` (`useAuth()`), `components/ui` (kit), `components/shell/AppShell` + `SignInCard`, `lib/ids.ts` (`newId`), `lib/media.ts` (`toVideoEmbed`).
