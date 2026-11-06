# Pollyn: QA report

**QA lead:** Grace (Hopper). **Date:** 2026-11-05. **Build:** dev server (`npm run dev`, port 3200, dev-mode auth).
**Method:** scripted Playwright (Chromium 149) runs against the live dev server at **390×844 (mobile, touch)** and **1280×800 (desktop)**, in **light and dark** (`localStorage tp-theme`). Every run records console errors and warnings, failed requests and HTTP ≥ 400, and checks for horizontal overflow. I reviewed the screenshots by eye. The spinner was run with normal motion and with `reducedMotion: 'reduce'`.

`npm run typecheck` passes, and `npm test` passes 42 of 42 after the fixes.

## Test matrix

| # | Flow / check | Desktop light | Desktop dark | Mobile light | Mobile dark |
|---|---|---|---|---|---|
| 1 | Sign in (dev) on `/` → dashboard | Pass | Pass | Pass | Pass |
| 1 | "Lunch run" template → builder opens on step 2 | Pass | Pass | Pass | Pass |
| 1 | Step 1: edit title, autosave ("Saved") | Pass | Pass | Pass | Pass |
| 1 | Step 2: add multiple choice with 3 options and max choices 2 | Pass | Pass | Pass | Pass |
| 1 | Step 2: YouTube link as question media (validated, embed preview) | Pass | Pass | Pass | Pass |
| 1 | Step 3: "Anyone with the link" and "Show voter names" | Pass | Pass | Pass | Pass (layout fixed, B6) |
| 1 | Step 4: publish (confetti) → share link → Copy (clipboard holds the URL) | Pass | Pass | Pass (layout fixed, B4) | Pass (B4) |
| 1 | Persisted poll matches (title, access, names, options, maxChoices, media) | Pass | Pass | Pass | Pass |
| 2 | Voter opens `/p/<slug>` → sign-in card → intro | Pass | – | Pass | Pass |
| 2 | Required question blocks Next and shows an inline error | Pass | – | Pass | Pass |
| 2 | Answer Q1 → Q2 → **close tab** → reopen → "Welcome back… You stopped at question 2 of 4", Q2 answer kept | Pass | – | Pass | Pass |
| 2 | Optional question shows "Skip"; multiple choice blocks a 3rd pick (max 2) | Pass | – | Pass | Pass |
| 2 | Review → edit Q1 → suggest an option (auto-selected) → "Back to review" → submit | Pass | – | Pass | Pass |
| 2 | Thank-you, vote count and results with bars, names and "your pick" | Pass (bars fixed, B1) | – | Pass | Pass |
| 2 | Reload after voting shows "You've voted ✓" | Pass | – | Pass | Pass |
| 3 | Guest joins public poll by name → votes → thank-you | Pass | – | Pass | Pass |
| 3 | Guest opens the ORG poll → "This poll is for org members only" | Pass (fixed, B2) | – | Pass | Pass |
| 4 | Results: live badge, started/completed/completion, bars, voter names, "Where people stopped" funnel | Pass (B1) | – | Pass | Pass |
| 4 | Spinner with Voters source: wheel **lands on the announced winner** (checked from the rotor matrix against the server draw) | Pass (normal motion) | – | Pass (normal) | Pass (reduced motion) |
| 4 | Custom list `Alice x3 / Bob / Cara`: 3 entries, 5 tickets; 2 winners, both spins land correctly, no repeats | Pass | – | Pass | Pass |
| 4 | Raffle: 2 winners, modal reveal, "Reveal all" | Pass | – | Pass | Pass |
| 4 | Entry count: 2 winners revealed in order, matching the server | Pass | – | Pass | Pass |
| 4 | Poll options source preview; draw history list (+ server `GET draws`) | Pass | – | Pass | Pass |
| 4 | History doesn't reveal winners before the animation lands | Pass (fixed, B3) | – | Pass | Pass |
| 4 | Mobile spinner: no horizontal overflow after the wheel lands | – | – | Pass | Pass (fixed, B5) |
| 5 | Dashboard cards, filters All / Live / Drafts / Closed (empty state) | Pass | Pass | Pass | Pass |
| 5 | Duplicate → new draft card; Delete → confirm modal; Cancel keeps it; Delete removes it | Pass | Pass | Pass (toast fixed, B7) | Pass |
| 5 | Close poll (step 4) → status closed, Closed filter shows it → Reopen → open | Pass | Pass | Pass (B4) | Pass |
| – | Console errors on the happy path | Only expected 401 / 403 from probing `GET /api/polls/:slug` before sign-in and for the guest on the org poll | | | |

## Bugs found and fixed

| ID | Severity | Bug | Fix |
|---|---|---|---|
| B1 | **High** | Result bars were invisible everywhere (results page and thank-you). `.track` had `flex: 1` inside the column-flex `.barRow`, so `flex-basis: 0` collapsed it to 0px tall. | `components/results/results.module.css:23`: `.barRow > .track { flex: none; }` |
| B2 | Medium | A guest opening an org-only poll saw "This poll is only for members of **another organisation**". That was wrong and confusing. | `components/vote/VoterApp.tsx:62-74`: a guest-specific "This poll is for org members only" card with a "Sign in with a work account" button |
| B3 | Medium | The games history panel showed the winner names **while the wheel was still spinning**, which spoiled the reveal. | `components/games/DrawHistory.tsx:13,38,43` (new `live` prop masks unrevealed winners as "?" and hides copy until done) and `components/games/GamesArcade.tsx:378` |
| B4 | Medium | Mobile, builder step 4 (live or closed): the voter preview and share card overflowed the stage, which cut off the Copy button and the Live/Closed badge. The `1fr` track used auto min width. | `components/builder/Builder.module.css:192`: `grid-template-columns: minmax(0, 1fr)` |
| B5 | Medium | Mobile spinner: once the wheel landed at a non-right angle, the rotated rotor square widened the page to 413px. The page zoomed out and the winner sheet's Done button became hard to hit. | `components/games/SpinnerWheel.module.css:2`: `.stage { overflow-x: clip; }` |
| B6 | Low | Mobile settings: the 4-option "Who sees results" pill wrapped unevenly ("Only me" alone on line 2). | `components/builder/StepSettings.tsx:55` wrapper and `components/builder/Builder.module.css:244-248` (2×2 grid ≤ 560px, 40px targets) |
| B7 | Low | Mobile: toasts sat at the bottom over sticky action bars and bottom-sheet modals. On the delete confirm sheet, the toast covered the Delete/Cancel buttons. | `app/globals.css:135`: toasts move under the top bar at ≤ 560px |
| B8 | Low | The builder's Next button read "Next : Settings" because the flex gap split the text. | `components/builder/Builder.tsx:323` |
| B9 | Trivial | The dashboard hero said "1 votes in". | `components/dashboard/Dashboard.tsx:151` |
| B10 | Trivial | Console warning on every video embed ("Allow attribute will take precedence over allowfullscreen"). | `components/ui/index.tsx:104`: dropped the redundant `allowFullScreen` (`allow` already includes `fullscreen`) |
| B11 | Trivial | `/favicon.ico` returned 404 on every page. | Added `app/icon.svg` (brand mark) |

## Known remaining issues and notes

- **Pending multi-winner draws lock setup.** If you close the winner modal mid-draw, the game tabs and entry-source panel stay disabled until you use "Draw next…" or "Reveal all". This is by design, but nothing on screen explains it beyond the "Reveal all" link.
- **Narrow share box on phones.** The share URL input shows only about "http://localhc…". It scrolls and Copy works, but a shorter display (host-less `/p/slug`) would read better.
- **One unreproduced flake.** In the first mobile voter run, one click timed out around Q2 → Q3 right after resume. Four later runs on mobile and desktop passed, and I couldn't reproduce it.
- **Leader ties.** Every tied option gets a 👑 (for example, three options at 33%). That's acceptable, but it looks busy.
- **Not covered here:**
  - Teams SSO / MSAL (only dev auth is available).
  - Image upload (`/api/uploads`) and option images.
  - Rating questions in the voter UI (only a server unit test covers them).
  - `closesAt` auto-close.
  - Anonymous mode.
  - The `after_close` and `owner_only` results visibility settings.
- **Full-page screenshots** show the sticky top bar and the "Skip to content" link in the middle of the page. That comes from Playwright stitching the image, not from the app. Viewport screenshots are clean.
- The Next.js dev "N" indicator, bottom-left, overlaps content in dev only.

## Final screenshots

Saved in the scratchpad at `shots/final/`:
`01-dashboard-desktop-light`, `02-dashboard-mobile-dark`, `03-builder-questions-desktop`, `04-voter-question-mobile-light`, `05-thank-you-mobile-light`, `06-results-desktop-light`, `07-spinner-mid-desktop`, `08-spinner-after-desktop`, `09-guest-org-only-mobile-dark`.
