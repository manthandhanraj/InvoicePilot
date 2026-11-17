# InvoicePilot

Invoice-to-decision automation for PS-1.

For local Supabase use, open the included `.env.local`, replace its three placeholders, then double-click `RUN-SUPABASE.cmd`. The original `RUN.cmd` opens the SQLite version.

For Vercel + Supabase deployment, start with **[VERCEL-SETUP.md](VERCEL-SETUP.md)**. It includes the SQL setup, three environment variables, user creation and deployment settings.

Double-click `RUN.cmd` (or run `npm start`). The runner checks Node.js, builds the app, starts the server and opens the browser once it is listening. If port 4173 is occupied, it chooses a free local port automatically. Keep the runner window open; Ctrl+C stops it. `START-INVOICEPILOT.cmd` also opens this runner. Requires Node.js 24+ and browser internet access for PDF/OCR libraries. No npm install or API key is required.

See [PROJECT-GUIDE.md](PROJECT-GUIDE.md) for setup, architecture, policy, verified behavior and current limitations. See [DEMO-SCRIPT.md](DEMO-SCRIPT.md) for the five-minute recording plan.

```sh
npm run build
npm run dev
```

57 automated checks pass, including PostgreSQL and Vercel adapter tests. Browser verification covers real text PDFs, complete and incomplete scanned PDFs, PNG/JPEG OCR, the four principal edge cases, exports, filters, error handling and a mobile viewport. See TEST-REPORT.md for the verified scope. The Vercel/Supabase adapter is ready for your project configuration. Its hosted Auth/Storage integration still needs the deployed smoke test described in the setup guide. Deployment and recording are intentionally left to the candidate; no live submission URL or video is included.
