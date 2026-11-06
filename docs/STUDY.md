# Pollyn: UX study

**Goal (from the brief):** get *everyone's* vote inside the org, from "what's for lunch?" to serious decisions, with a slant toward fun events. People join through their Teams org identity, and a gamified randomiser turns the result into a moment.

**Method:** we used the client brief, a review of common poll tools (Teams/Forms polls, Slido, Mentimeter, Doodle, Polly) and the constraints of Teams tabs (iframe, SSO, mobile clients). From these we wrote personas, jobs-to-be-done and design principles, then cut the MVP.

## 1. Personas

| Persona | Context | Needs | Pain today |
|---|---|---|---|
| **Creator / admin** ("Maya, office & culture lead") | Desktop Teams, builds 2–5 polls a month: team lunch, offsite venue, award nominations, policy feedback | Build fast, add pictures and menus, control who can vote and who sees what, see who hasn't voted, share one link | Forms is heavy for quick questions. Chat polls are too thin (no images, no suggestions, no results control). |
| **Voter on mobile** ("Sam, field engineer") | Teams mobile between jobs, 30–60 seconds of attention, often interrupted | One tap to open, no extra login, big targets, one question at a time, resume later, suggest a missing option | Logins inside webviews. Long forms lose progress. "None of these options." |
| **Event host** ("Raj, runs the town hall and party") | Laptop on a big screen or projector, live audience | Live results that look good on screen, a spinner or raffle that the crowd trusts is fair, a quick re-draw | Spreadsheets plus random.org feel opaque and flat. Results aren't shareable live. |

## 2. Jobs-to-be-done

1. *When we need a group decision*, I want to **ask once and reach everyone in the org**, so I don't chase replies across chats.
2. *When options aren't obvious*, I want **voters to add suggestions**, so the best idea can come from anyone.
3. *When I'm voting on my phone*, I want to **answer in seconds and pick up where I left off**.
4. *When the topic is sensitive*, I want **anonymity and results visibility I can explain**, so people answer honestly.
5. *When it's an event*, I want to **turn participation into a draw or spin**, so voting feels rewarding and the outcome feels fair.

## 3. Principles applied in the MVP

| Principle | How Pollyn applies it |
|---|---|
| **Zero-friction identity** | Inside Teams: silent SSO (`getAuthToken`), so there's no login screen. In a browser: one Microsoft popup. Public polls also allow a name-only guest. |
| **Step by step** | The builder has 4 steps (Basics → Questions → Settings → Publish) and autosaves the draft. The voter flow shows one question per step with a progress bar, a review screen and Enter = next. |
| **Resume, never lose work** | Every step change saves the response with `currentStep`. Coming back shows "Welcome back, you stopped at question 3". A completed vote stays editable until the poll closes. |
| **Mobile-first** | Works at 360px wide with tap targets ≥ 40px. Images and video help understanding without long text. |
| **Suggestions** | Per question `allowSuggestions`. The server merges case-insensitive duplicates, so suggestions converge instead of fragmenting. |
| **Transparency toggles** | The creator chooses: org-only vs anyone with the link; results `always / after vote / after close / owner only`; show vote counts; show voter names; fully anonymous. The voter sees these choices before answering. |
| **Fair, server-side draws** | Winners are picked on the server with `crypto.randomInt`, using weighted tickets with no repeats. The UI animates *to* the server's result, and every draw is logged in history. Host screens can't cherry-pick. |
| **Restrained delight** | FLNT palette. Motion of 140–360ms with ease-out, honouring reduced-motion. Confetti only on payoffs (submit, winner). |

## 4. Engagement and gamification rationale

- **Participation is the reward loop.** Each completed vote is a raffle ticket, plus a bonus ticket per suggestion if the host enables it. This rewards both turnout and ideas, which the brief explicitly wants, without changing the vote itself.
- **Three game modes for three moods.** The **Spinner** suits small groups and food picks (pick from the options). The **Raffle** suits big crowds and prizes (pick from participants). **Entry count** is a transparent ticket board, so people can see *why* they had their odds.
- **Live results on a big screen** (auto-refresh and animated bars) give the host a "reveal" moment.
- **Guardrails:** games never decide a *serious* poll by default. The host chooses the entry source explicitly, and anonymous polls show "Voter #n" instead of names.

## 5. Risks and mitigations

| Risk | Mitigation (MVP) | Later |
|---|---|---|
| **Anonymity expectations.** "Anonymous" can still be inferred in small groups, or by admins who can read the database. | Anonymous mode hides names from everyone, including the owner. The settings are shown to voters. Copy says "your name isn't shown", not "untraceable". | Minimum-group threshold before showing results. Optional "no identity stored" mode. |
| **Guest abuse on public polls** (ballot stuffing with new guest sessions) | Guests only on polls marked *Anyone with the link*. Org polls require a tenant match. Guests can never create polls. | Rate limits per IP, CAPTCHA, a "verified votes only" results filter. |
| **Teams iframe auth quirks** (third-party cookies blocked, popups blocked, mismatched App ID URI) | SSO token exchange to an HttpOnly `SameSite=None; Secure` cookie. `frame-ancestors` CSP for Teams and Office hosts. A step-by-step Entra checklist (`SETUP.md`). | Bearer-token mode as a fallback if browsers block third-party cookies in Teams web. Nested app authentication. |
| **Tunnel or host changes break SSO** | The builder derives the manifest from `APP_BASE_URL`, and the docs warn to update the App ID URI. | Fixed custom domain in production. |
| **Free-tier limits** (Neon 0.5 GB, images in DB) | Documented; 3 MB image cap. | Object storage for images; paid tiers. |
| **Low turnout** | Share link, live counters, results-after-vote as a nudge, raffle tickets. | Bot reminders to people who haven't voted. |

## 6. Scope: MVP vs next steps

| In the MVP | Next steps (priority order) |
|---|---|
| Personal Teams tab "Polls" plus About; works in a browser too | **Channel, group-chat and meeting tab** (configurable tab with a config page) and a **meeting stage** view for the live reveal and raffle |
| Teams SSO, MSAL popup fallback, dev mode, guests on public polls | **Bot notifications:** "new poll", reminders to non-voters, results posted on close |
| Builder: single / multiple / rating / text questions, option images, question image or video, required, max choices, suggestions | **Adaptive Card voting** inline in chat for single-question polls (vote without opening the tab) |
| Access, results visibility, counts, names, anonymous, close date | **Graph-based org directory:** target audiences (teams, groups), and a "who hasn't voted" list |
| Resumable voting, live results, drop-off funnel | **Scheduling:** open and close at set times, recurring polls (weekly lunch) |
| Spinner, raffle, entry count with server-side weighted draws and history | **Exports:** CSV/XLSX results and draw audit log |
| Postgres (Neon) with images in the DB | Blob storage for uploads. Templates gallery. Localization. |

**Success signals to watch:** completion rate (started → completed), time-to-vote on mobile, share of votes coming from inside Teams (SSO), suggestions per poll, and repeat creators per month.
