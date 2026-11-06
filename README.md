# Pollyn (TeamsPoll)

**Get everyone's vote.** Pollyn is a Microsoft Teams org app for polls, covering the lunch order, the offsite venue and serious decisions, and built to make fun events more fun. Voters sign in with their Teams work account, answer one question at a time on any device, suggest their own options, and can pick up where they left off. Hosts then run a spinner, raffle or entry-count draw on the big screen.

Built by FLNT. It's an MVP and runs locally in minutes without Azure.

## Features

- **Step-by-step poll builder** (Basics → Questions → Settings → Publish) with draft autosave.
- **All the question types:** single choice, multiple choice (with max choices), rating and free text. Questions can be required, and options can have images.
- **Media:** cover and per-question images or embedded video (YouTube, Vimeo and more) for reference.
- **Suggestions:** voters can add a missing option, with duplicates merged automatically.
- **Resumable voting:** progress is saved on every step ("Welcome back, you stopped at question 3"). Votes can be edited until close.
- **Access control:** *Org only* (Teams/Entra sign-in, same tenant) or *Anyone with the link* (org users plus name-only guests).
- **Transparency toggles:** results visibility (always, after vote, after close, owner only), vote counts on or off, voter names on or off, fully anonymous, close date.
- **Live results:** animated bars, rating distribution, text wall, voter chips and an owner drop-off funnel, auto-refreshing.
- **Randomiser arcade:** spinner wheel, raffle draw and entry count. Draws are weighted, fair and **server-side**, with history. Participants can get bonus tickets for suggestions.
- **Teams-native:** silent SSO inside Teams, MSAL popup in the browser, FLNT design, mobile-first, and subtle motion that respects reduced-motion settings.
- **Permissions:** everyone can create polls and share their own link, or only admins (`POLL_CREATORS`, `ADMIN_EMAILS`).

## Quick start

```bash
npm install
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
npm run dev              # → http://localhost:3200
```

With `AZURE_CLIENT_ID` empty, Pollyn runs in **dev mode**: sign in with any name and email, with no Microsoft login. To run it inside Teams with SSO, follow **[docs/SETUP.md](docs/SETUP.md)**.

Requires **Node 24**. No database to install: it runs an embedded Postgres locally and Neon Postgres when deployed (see `docs/SETUP.md` → Deploy for the free Vercel + Neon setup).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3200 |
| `npm run build` / `npm start` | Production build and server (port 3200) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and API tests (`node --test`) |
| `node appPackage/build.mjs` | Builds the Teams app package → `appPackage/build/pollyn.zip` (`npm run package:teams` once the script is added) |

## Project structure

```
app/                 Next.js App Router pages + API routes
  api/               JSON API (see docs/CONTRACT.md)
  p/[slug]/          Voter flow
  create/, polls/[id]/{edit,results,games}/
  auth/blank/        MSAL popup redirect page
components/          UI kit (ui/), shell, builder, vote, results, games, dashboard
lib/
  types.ts           Shared types (source of truth)
  client/            api() helper, auth (Teams SSO / MSAL / dev / guest)
  server/            env, Postgres adapter (Neon / PGlite), auth, access rules, draws
appPackage/          Teams manifest template + dependency-free package builder
data/                local PGlite database (git-ignored)
docs/                CONTRACT, SETUP, STUDY
tests/               node:test suites
```

## Team

Pollyn was built by a small agent team, each with an owned slice of the codebase (see [TEAM.md](TEAM.md)):

| Name | Role |
|---|---|
| **Linus** (Torvalds) | Backend core engineer |
| **Leonardo** (da Vinci) | Super designer |
| **Ada** (Lovelace) | Voter experience dev |
| **Woz** (Steve Wozniak) | Game mechanics maker |
| **Marie** (Curie) | Main researcher |
| **Grace** (Hopper) | QA lead |

## Docs

- [docs/SETUP.md](docs/SETUP.md): local dev, HTTPS tunnel, Entra ID / Teams SSO, Teams package, deployment, permissions
- [docs/STUDY.md](docs/STUDY.md): UX study (personas, jobs-to-be-done, principles, risks, roadmap)
- [docs/CONTRACT.md](docs/CONTRACT.md): API and page contract
- [Start.md](Start.md): original client brief
