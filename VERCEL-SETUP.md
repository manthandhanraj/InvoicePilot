# Deploy InvoicePilot on Vercel + Supabase

The application has a Vercel Functions entry point and Supabase-backed authentication, PostgreSQL records and private document storage. The original local runner also remains available.

## 1. Prepare Supabase

1. Create a Supabase project in your own account. Save your database password securely; this app does not need that password in Vercel.
2. Open the SQL editor and run the complete contents of **supabase/schema.sql** once. It creates the tables, private `invoicepilot` bucket, row-level policies and server-only transaction functions.
3. In Authentication / Users, create your candidate account with an email and password and ensure its email is confirmed. Create a separate confirmed account for a reviewer if needed. Each account has its own invoice history and PO allocations.
4. Keep public sign-up disabled for this private case-study workspace. The application intentionally provides sign-in rather than public registration.
5. From your project's API settings, copy the project URL, the legacy **anon** key and the legacy **service_role** key. Use the service-role key only in server environment variables.

The project SQL does not require your service-role key to be pasted into the SQL editor. It creates a private bucket; do not make the bucket public.

## 2. Add the source to your personal Git repository

Extract the ZIP. Use the **InvoicePilot** folder as the repository root: `package.json`, `vercel.json`, `api/`, `public/`, `src/` and `supabase/` should be directly inside it.

Include `package-lock.json`. Do not upload `node_modules`, `.local`, `outputs` or a filled `.env.local`. `.gitignore` excludes them. The bundled `.env.example` contains placeholders only.

## 3. Import into Vercel

Import that repository as a new project. Choose **Other** as the framework preset. The included `vercel.json` supplies these settings:

| Setting | Value |
| --- | --- |
| Root Directory | The folder containing package.json |
| Node.js | 24.x, selected by package.json |
| Install Command | npm ci |
| Build Command | npm run build:vercel |
| Output Directory | dist/client |
| API entry point | api/index.js |

Vercel handles `/api/*` through one Node.js function, including streaming run events. Do not use `npm start` as the cloud build command; that command is the local runner.

## 4. Set the three server environment variables

Add them in Vercel's project settings for the deployment environments you intend to use, then deploy or redeploy.

| Name | Value from your Supabase project |
| --- | --- |
| SUPABASE_URL | https://YOUR-PROJECT.supabase.co |
| SUPABASE_ANON_KEY | Legacy anon key |
| SUPABASE_SERVICE_ROLE_KEY | Legacy service_role key |

Do not prefix these names with `NEXT_PUBLIC_` or `VITE_`. The service-role key must never appear in frontend code, screenshots or a public repository. The server also accepts `SUPABASE_PUBLISHABLE_KEY` in place of the anon variable, but the three-variable legacy-key setup above is the documented route.

No paid LLM API key is required. Field extraction is deterministic; OCR runs in the visitor's browser.

## 5. Check the deployed link

1. Open the published URL and sign in with the confirmed Supabase user you created.
2. Run **A clean match**. It should approve and appear in the queue after a reload.
3. Run that same sample again. It should be rejected as a duplicate.
4. Run **A second milestone**, then **The balance check**. The third Aster invoice should need review with 11,500 already committed.
5. Run **Which purchase order?** and an incomplete/complete scan.
6. Open an invoice's **View source**, download a decision and test Sign out.
7. Check that your intended interviewer can access the Vercel link and has a working app account. Vercel deployment protection and the app's Supabase sign-in are separate access controls.

Only after this deployed smoke test should you record the final video. An expected URL or a successful build alone is not evidence of a working deployment.

## How 10 MB uploads work

PDF reading and OCR happen in the browser. The signed-upload endpoint issues a one-object upload URL, then the browser sends the original file directly to private Supabase Storage. Only the small text/metadata request goes to the Vercel Function. The server downloads and validates the stored bytes, calculates the file hash and applies the same decision engine. Source viewing redirects to a short-lived signed download, so large source documents do not pass through a Vercel response body either.

Signed upload reservations expire for processing after 30 minutes. A consumed reservation cannot process twice. Aborted uploads cannot become runs. If an upload/network interruption leaves an unprocessed object, it may remain in private storage; remove old abandoned objects through the project dashboard when needed. Files referenced by saved runs should be retained for their audit trail.

## Local options

- **RUN.cmd / npm start:** original SQLite workspace, no Supabase setup needed.
- **Supabase-backed preview:** open the included `.env.local`, fill your own values, then double-click `RUN-SUPABASE.cmd`. Alternatively run `npm run dev:vercel`. This uses the same Vercel/Supabase code path on `http://127.0.0.1:4188`.
- **Tests:** run `npm ci`, `npm test`, then `npm run build:vercel`. PDF fixture tests additionally need Python with pypdf. PostgreSQL tests use PGlite; no Docker or cloud project is needed for those tests.

The files `scripts/qa-supabase.mjs` and `tests/helpers/*` are controlled local test fixtures, not a substitute for a real Supabase project. They are excluded from deployment and are not used by the production API.

## Verification boundary

The local invoice workflow was browser-verified, and the Vercel adapter was checked against PostgreSQL and a controlled Supabase Auth/Storage contract fixture. The SQL schema, owner isolation, transaction guards, cookies, sign-in, direct uploads above 4.5 MB and API rewrites pass tests. Your actual Supabase/Vercel credentials were not supplied, so no live deployment or production account integration is claimed.

## Free-plan considerations

Use the current Vercel Hobby and Supabase Free usage allowances for a personal/non-commercial case-study demo. These are quota-limited services. Supabase's free project can pause after inactivity; resume it and run the smoke test before the interview.

Official references: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Function limits](https://vercel.com/docs/functions/limitations), [Supabase pricing](https://supabase.com/pricing), [Supabase signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl).
