# Pollyn (TeamsPoll): Team

An MVP Microsoft Teams org app for polls (food runs or serious decisions, built for fun events), with voter suggestions, resumable step-by-step voting, live results, and a gamified randomiser (spinner, raffle, entry count). The brief is in `Start.md`, and the contract is in `docs/CONTRACT.md` plus `lib/types.ts`.

The orchestrator is Claude. It owns the contract, shared kit and integration.

| Name | Role | Owns (may edit) |
|---|---|---|
| **Linus** (Torvalds) | Backend core engineer | `lib/server/**`, `app/api/**`, `tests/**` |
| **Leonardo** (da Vinci) | Super designer | `app/page.tsx`, `app/create/**`, `app/polls/[id]/edit/**`, `components/builder/**`, `components/dashboard/**`, `components/shell/AppShell.tsx`, `components/ui/**` (additive), `app/globals.css` (additive) |
| **Ada** (Lovelace) | Voter experience dev | `app/p/**`, `app/polls/[id]/results/**`, `components/vote/**`, `components/results/**` |
| **Woz** (Steve Wozniak) | Game mechanics maker | `app/polls/[id]/games/**`, `components/games/**` |
| **Marie** (Curie) | Main researcher | `docs/STUDY.md`, `docs/SETUP.md`, `README.md`, `appPackage/**` |
| **Grace** (Hopper) | QA lead | `tests/e2e/**`, `docs/QA.md` (after integration) |

## Rules
1. **Only edit files you own.** If you need a change somewhere else (types, shared kit, another agent's file), describe the exact change in your final report. Shared files (`lib/types.ts`, `lib/client/*`, `lib/ids.ts`, `lib/media.ts`, `components/shell/{Providers,SignInCard,PollNav}.tsx`, `docs/CONTRACT.md`, `package.json`, `TEAM.md`) belong to the orchestrator.
2. **Build against `docs/CONTRACT.md` and `lib/types.ts`.** If the contract is wrong, say so instead of quietly working around it.
3. **Design:** FLNT tokens only (`var(--accent)`, `var(--surface)` etc.), with no hard-coded colours except brand gradients. Reuse the `tp-*` classes and `components/ui`. Everything must work at 360px wide. Keep motion purposeful: 140–360ms, ease-out, and honour reduced motion. Make tap targets ≥ 40px.
4. **Env:** Windows, Node 24, npm 11. Don't add npm dependencies; ask instead. Use `npm run typecheck` before reporting. The dev server is `npm run dev` (port 3200); don't leave servers running.
5. **No git commits.** The orchestrator commits.
6. **Report back** with what you built, how to try it, contract issues, and anything blocked.
