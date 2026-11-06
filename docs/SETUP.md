# Pollyn setup guide

This guide takes Pollyn from a laptop demo to an org-wide Teams app:

1. [Run locally in dev mode](#1-run-locally-dev-mode-no-azure) (no Azure needed)
2. [Expose it over HTTPS](#2-expose-it-over-https-tunnel) (Teams only loads `https` tabs)
3. [Register the app in Microsoft Entra ID](#3-register-the-app-in-microsoft-entra-id-teams-sso) (Teams SSO)
4. [Set the environment variables](#4-environment-variables)
5. [Build and upload the Teams app package](#5-build-and-upload-the-teams-app-package)
6. [Deploy to a host](#6-deploy)
7. [Set who can create polls](#7-permissions)

Prerequisites: **Node 24** and npm 11. No database install is needed locally: without `DATABASE_URL`, Pollyn runs an embedded Postgres (PGlite).

---

## 1. Run locally (dev mode, no Azure)

```bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # http://localhost:3200
```

When `AZURE_CLIENT_ID` is empty, Pollyn runs in **dev mode**. "Sign in" asks for a name and email, and everyone signs in as a member of a fake org (`dev-org`). This lets you try every feature (building polls, voting, results and games) without Microsoft login. Open a second browser profile or a private window to vote as another person.

Local data (polls, votes and uploaded images) is stored in `data/pglite/`. Stop the server and delete that folder to start fresh. Only one process can use the folder at a time.

> Dev mode is for local use only. Never deploy with an empty `AZURE_CLIENT_ID`, because anyone could sign in as anyone.

## 2. Expose it over HTTPS (tunnel)

Teams tabs must be served over `https` from a domain listed in the manifest. For local testing, use a tunnel.

**Microsoft dev tunnels** (recommended; [install `devtunnel`](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started)):

```bash
devtunnel user login
# Quick, temporary URL:
devtunnel host -p 3200 --allow-anonymous
# Or a persistent URL that survives restarts (better: the Entra App ID URI contains the host):
devtunnel create pollyn --allow-anonymous
devtunnel port create pollyn -p 3200
devtunnel host pollyn
```

You'll get a URL like `https://abc123x4-3200.euw.devtunnels.ms`.

**ngrok** works too: `ngrok http 3200`. A reserved or static domain saves you from re-registering every time.

Then:

- Set `APP_BASE_URL=https://<your-tunnel-host>` in `.env` and restart `npm run dev`.
- The host is baked into the Entra **Application ID URI** and the Teams manifest. **If the tunnel host changes, update both** (step 3.3 and step 5).
- If the page loads through the tunnel but scripts or HMR fail, Next.js is blocking cross-origin dev requests. Either add `allowedDevOrigins: ["*.devtunnels.ms"]` to `next.config.ts` or test a production build (`npm run build && npm start`).

## 3. Register the app in Microsoft Entra ID (Teams SSO)

Inside Teams, the client calls `authentication.getAuthToken()` (Teams SSO), so users never see a login screen. In a normal browser it falls back to an MSAL popup. Both produce an access token for **`api://<host>/<clientId>/access_as_user`**, which the server verifies.

Go to [Entra admin center](https://entra.microsoft.com) → **App registrations** → **New registration**.

1. **Name:** `Pollyn`.
2. **Supported account types:** choose **Accounts in this organizational directory only (single tenant)**. This is recommended for an org-exclusive LOB app. Copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. **Expose an API** → *Application ID URI* → **Add** → set it to
   `api://<host>/<clientId>` (for example `api://pollyn.contoso.com/1b2c...`).
   - `<host>` must be exactly the host of `APP_BASE_URL`, in **lowercase**, with no scheme, and with no port unless your URL has one.
4. **Add a scope:** name `access_as_user`, *Who can consent*: **Admins and users**, with display names and descriptions such as "Sign in to Pollyn as you". State: **Enabled**.
5. **Authorized client applications:** add each ID below and tick the `access_as_user` scope. This list comes from [Microsoft Learn: Register tab app with Entra ID](https://learn.microsoft.com/microsoftteams/platform/tabs/how-to/authentication/tab-sso-register-aad#configure-scope-for-access-token):

   | Microsoft 365 client | Client ID |
   |---|---|
   | Teams desktop, mobile | `1fec8e78-bce4-4aaf-ab1b-5451cc387264` |
   | Teams web | `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` |
   | Microsoft 365 web | `4765445b-32c6-49b0-83e6-1d93765276ca` |
   | Microsoft 365 desktop | `0ec893e0-5785-4de6-99da-4ed124e5296c` |
   | Microsoft 365 mobile, Outlook desktop | `d3590ed6-52b3-4102-aeff-aad2292ab01c` |
   | Outlook web | `bc59ab01-8403-45c6-8796-ac3ef710b3e3` |
   | Outlook mobile | `27922004-5251-4030-b22d-91ecd9a37ea4` |

   Only the two Teams IDs are strictly needed for the Teams tab. The others let the same personal tab run inside the Microsoft 365 app and Outlook.
6. **Manifest** (in the Entra app registration, not the Teams one): set `"requestedAccessTokenVersion": 2` (older portal view: `accessTokenAcceptedVersion`) → **Save**. This gives v2 tokens.
7. **Authentication** → *Add a platform* → **Single-page application** → Redirect URI `https://<host>/auth/blank`.
   - This is only used by the MSAL popup when Pollyn is opened in a normal browser (for example, a shared poll link opened outside Teams). Add `http://localhost:3200/auth/blank` too if you want to test org login locally.
8. **API permissions:** the default `Microsoft Graph › User.Read` (delegated) is enough. Pollyn reads the name, email and tenant from the token itself and doesn't call Graph. If you want, use **Grant admin consent** so nobody sees a consent prompt.

No client secret is needed. The server only *verifies* tokens against the tenant's public signing keys.

## 4. Environment variables

| Variable | Example | Notes |
|---|---|---|
| `AZURE_CLIENT_ID` | `1b2c…` | Entra application (client) ID. Empty = dev mode. |
| `AZURE_TENANT_ID` | `72f9…` | Locks sign-in to your tenant. Recommended for org-exclusive use. Empty = any work account. |
| `APP_BASE_URL` | `https://pollyn.contoso.com` | Public URL. Used for the SSO audience `api://<host>/<clientId>` and for share links. No trailing slash. |
| `SESSION_SECRET` | 64 random chars | **Required** when `AZURE_CLIENT_ID` is set. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `POLL_CREATORS` | `everyone` / `admins` | Who can create polls (see step 7). |
| `ADMIN_EMAILS` | `a@contoso.com,b@contoso.com` | Comma-separated admin emails (case-insensitive). |
| `TEAMS_APP_ID` | GUID | Optional. Pins the Teams app ID used by the package builder (see step 5). |
| `TEAMS_APP_VERSION` | `1.0.1` | Optional. Teams app version. Defaults to the `package.json` version. **Bump it every time you re-upload a changed package.** |
| `DATABASE_URL` | `postgres://…neon.tech/…` | Postgres connection string (set automatically by the Vercel Neon integration). Empty = embedded PGlite. |
| `TP_DB_PATH` | `data/pglite` | Optional. PGlite folder when `DATABASE_URL` is empty. |

## 5. Build and upload the Teams app package

```bash
node appPackage/build.mjs      # or: npm run package:teams
```

The builder reads `.env` (and `.env.local`; real environment variables win) and fills `appPackage/manifest.template.json`:

- `{{HOST}}` comes from the `APP_BASE_URL` host
- `{{CLIENT_ID}}` comes from `AZURE_CLIENT_ID`
- `{{APP_ID}}` comes from `TEAMS_APP_ID`. If that isn't set, the builder derives a stable GUID from the client ID. **Copy the printed ID into `.env` as `TEAMS_APP_ID`** so it never changes.

It draws the icons (`color.png` 192×192, `outline.png` 32×32 white on transparent) and writes **`appPackage/build/pollyn.zip`**, which contains `manifest.json`, `color.png` and `outline.png`. If values are missing, it prints warnings and uses placeholders.

The manifest uses schema **v1.30** and has two personal tabs: **Polls** (`https://<host>/`) and **About**.

**Upload: pick one**

- **For yourself or for testing:** Teams → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app** → choose `pollyn.zip`. Custom app upload (sideloading) must be allowed for you by policy.
- **For the whole org (recommended):** [Teams admin center](https://admin.teams.microsoft.com) → **Teams apps** → **Manage apps** → **Actions** → **Upload new app** → choose `pollyn.zip`. Then allow it (Org-wide app settings / app availability), and optionally pin it for everyone with an **App setup policy**. It then appears under *Built for your org*.
- **To update it:** bump `TEAMS_APP_VERSION`, rebuild, and upload over the existing app (in the admin center, use the app's page → **Upload file**).

You can check a package with the [Developer Portal for Teams](https://dev.teams.microsoft.com) → *Apps* → *Import app* → *Validate*.

## 6. Deploy (free: Vercel Hobby + Neon Postgres)

Pollyn stores everything in Postgres, including uploaded images, so it runs on Vercel's serverless functions with no disk. Both services have free tiers that cover a proof of concept. Vercel Hobby is meant for non-commercial use, so move to Pro if this becomes a production tool.

1. **Put the code on GitHub.** Create a private repo and push this folder. `.env`, `data/`, `.next` and `node_modules` are git-ignored.
2. **Create the Vercel project.** Sign up at vercel.com with GitHub, choose *Add New → Project*, import the repo and keep the defaults (Next.js, `npm run build`). Deploy once. The first deploy fails or shows errors until the database exists, which is expected.
3. **Add the free database.** In the project, open *Storage → Create Database → Neon (Serverless Postgres)*, choose the **Free** plan and a region near your users, and connect it to the project. This sets `DATABASE_URL` (and `POSTGRES_URL`) automatically. Pollyn creates its tables on first request.
4. **Set environment variables** (*Settings → Environment Variables*, Production):
   - `SESSION_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
   - `APP_BASE_URL`: your stable production URL, e.g. `https://pollyn.vercel.app`. Don't use a per-deployment URL; the Teams SSO audience must stay fixed.
   - `ADMIN_EMAILS`, `POLL_CREATORS` (optional).
   - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`: leave empty for a dev-mode demo (anyone can sign in by typing a name, so only share the link with people you trust). Fill them in once the Entra app registration from step 3 exists.
5. **Redeploy** (*Deployments → ⋯ → Redeploy*) so the new variables apply, then open the URL.
6. **Teams:** in Entra, set the Application ID URI to `api://<your-vercel-host>/<clientId>` and add `https://<your-vercel-host>/auth/blank` as a SPA redirect URI. Then set `APP_BASE_URL` locally and run `npm run package:teams` and upload the zip (step 5).

Every `git push` to the main branch redeploys automatically.

**Free tier limits to know:** Neon Free gives 0.5 GB of storage, which is plenty for polls but fills up with roughly a few hundred 1–3 MB images. Prefer image links or small images. Neon suspends an idle database after a few minutes, so the first request after a quiet period takes a second or two longer. Vercel limits request bodies to 4.5 MB (uploads are capped at 3 MB).

**Other hosts:** Pollyn is a plain Next.js server (`npm run build && npm start`). Any Node 24 host works with `DATABASE_URL` set. Without `DATABASE_URL` it uses an embedded Postgres (PGlite) in `data/pglite`, which needs a persistent disk and a single instance.

## 7. Permissions

| Setting | Effect |
|---|---|
| `POLL_CREATORS=everyone` | Any signed-in org member can create polls and share their own link. This is the default and suits fun or social use. |
| `POLL_CREATORS=admins` | Only people in `ADMIN_EMAILS` can create polls. Everyone else can vote. |
| `ADMIN_EMAILS` | Admins. Matched against the signed-in user's email or UPN. |
| Per poll: **Org only** | Voter must be signed in with a work account from the poll's tenant. |
| Per poll: **Anyone with the link** | Org users plus **guests** (name only). Guests can vote but can never create polls. |

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Tab is blank or "refused to connect" | URL isn't https, host isn't in `validDomains`, or a proxy sends `X-Frame-Options`. |
| SSO fails with `invalid_resource` or `resource principal not found` | The Application ID URI doesn't match `api://<host>/<clientId>` exactly (watch for uppercase letters and a changed tunnel host). |
| SSO fails with `consent_required` | Teams client IDs aren't pre-authorized, or the scope isn't named `access_as_user`. Grant admin consent. |
| Server rejects the token (401) | Wrong `AZURE_TENANT_ID`, or `APP_BASE_URL` host differs from the one in the Application ID URI. |
| Browser login popup closes but nothing happens | `https://<host>/auth/blank` isn't registered as a **SPA** redirect URI. |
| Teams upload error about the version | The same version was already uploaded, so bump `TEAMS_APP_VERSION`. If your tenant rejects schema 1.30, change `$schema` and `manifestVersion` to `1.29` in the template (no other changes needed). |
