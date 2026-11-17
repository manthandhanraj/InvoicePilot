# InvoicePilot

PS-1 case study: invoice-to-decision automation with a dashboard, actual processing stages and a durable decision trail.

## Run locally

Requires Node.js 24+. No npm installation or API key is needed. On Windows, double-click `RUN.cmd` or run `npm start`. It builds the app, starts the server and opens your browser. It chooses another local port if 4173 is occupied. Keep the server window open; Ctrl+C stops it. The earlier `START-INVOICEPILOT.cmd` delegates to the same runner. Alternatively:

```sh
npm run build
npm run dev
```

PDF.js, Tesseract and English OCR data load in the browser from pinned CDNs; processing requires internet access. Failed library loading produces an error and manual-transcription option. Manual text always requires review.

Local records use Node SQLite and documents under ignored `.local/`. The server binds to loopback. Vercel production uses api/index.js with Supabase Auth, PostgreSQL and private Storage; follow VERCEL-SETUP.md. The optional original Cloudflare Worker target retains D1/R2 configuration in `.openai/hosting.json`. Hosted records are scoped to the authenticated platform user ID. No credentials are stored in source.

## Workflow

1. Upload a PDF, PNG or JPEG (10 MB, up to 10 PDF pages).
2. PDF.js reads positioned text; image-only pages use Tesseract OCR. Mixed documents process each page individually.
3. A deterministic English label parser extracts fields, leaving missing values empty.
4. Server checks required data, approved suppliers, duplicates, dates, PO ownership/status, currency, cumulative balance and available arithmetic.
5. Actual stages stream to the interface. Result: Approved, Needs review or Rejected, with reasons.
6. Original document, text, file fingerprint, checks and decision are saved. Export CSV, JSON decisions or a reviewer handoff note.

Approved means **eligible for AP approval**. The app sends no payments or supplier messages.

## Demo sequence

Use Rules & demo with a clean workspace. Buttons read actual PDFs through the same extraction path as uploads.

| Step | Input | Expected outcome |
| --- | --- | --- |
| 1 | A clean match, 4,500 USD | Approved against PO-2026-041 |
| 2 | Same PDF again | Duplicate rejected; balance unchanged |
| 3 | Second milestone, 7,000 USD | Approved; cumulative spend 11,500 |
| 4 | Balance check, 1,500 USD | Review; projected 13,000 exceeds PO 12,000 plus tolerance 50 |
| 5 | Orbit invoice without a PO | Review; two plausible POs visible |
| 6 | Northstar scanned PDF missing total | OCR reads a real image-only PDF; missing total requires review |

Four principal edge cases: duplicate submission, cumulative partial billing, ambiguous PO, incomplete scanned input. A EUR sample adds a currency mismatch. Reset clears only runs with the exact bundled sample file fingerprints, preserving other uploads.

## Policy

- Required: vendor, invoice number, valid invoice date, currency and positive total. Future/ambiguous dates require review.
- Exact normalised vendor names/declared aliases only. Unknown suppliers require review; explicitly unapproved suppliers are rejected.
- Duplicate detection: vendor + normalised invoice number and SHA-256 file hash. Database claims handle simultaneous submissions.
- Explicit PO first. Infer a missing PO only for a single open vendor/currency match. Otherwise review.
- PO and invoice totals both include tax. Different currencies always require review.
- Cumulative tolerance: `min(PO × 1%, 50)` in the PO currency, compared in integer cents. Only approved invoices reserve spend. Atomic database allocation protects the full ledger.
- Subtotal + tax + shipping − discount must match total within 0.02 when the breakdown is present. No tax split is invented for tax-inclusive totals. Conflicting totals, dates, tax components or currency codes require review. Field evidence and PO reconciliation are visible on each result.
- Optional line format: `Description | quantity | unit price | line total` enables item checks.
- OCR score below 80% and manual transcription require review. OCR score is not a guarantee of field accuracy.

## Limits

OCR is the machine-learning component; **no LLM is integrated**. English label extraction supports common supplier/invoice labels, next-line amounts, written month dates, itemised rows, separate tax components and tax-inclusive totals. Ambiguous numeric dates and conflicting totals/currencies go to review. It is not a universal invoice parser. POs and vendors are synthetic fixtures, not ERP records. Dashboard shows the latest 1,000 runs; database balance protection covers the full ledger. Review is a handoff; this version has no correction-and-approval screen. No supplier legal verification, tax verification, goods-receipt matching or payment execution.

## Verification

Install test dependencies with `npm ci` first.

```sh
npm test
npm run validate
```

Rule/API tests cover extraction, atomic duplicate and balance protection, persistence, source-file access, owner isolation and reset. PDF tests read actual fixtures through Python `pypdf`, available in the development environment. Application runtime needs no Python. UI route tests check rendering logic, not visual browser appearance. Hosted D1/R2 still needs a production smoke test.

At handoff, 57 automated tests and ESM checks pass. Real browser runs verified text PDFs, both complete and incomplete scanned PDFs, PNG/JPEG OCR, duplicate detection, partial billing, overbilling, ambiguous matching, currency mismatch, manual transcription, exports, filters, explicit error states and a mobile viewport. See TEST-REPORT.md. Deployment and video recording are intentionally the candidate's tasks. No Vercel or Supabase project was provisioned with your credentials. PostgreSQL rules and Vercel adapter contracts are tested locally; the real hosted smoke test belongs to deployment.

## Code

`public/` holds the interface and browser document reader; `src/extraction.js` field extraction, `src/engine.js` decisions; `src/worker.js` streamed API and atomic persistence; `src/data.js` policy and fixtures; `drizzle/` database schema; `scripts/` build/local server; `tests/` verification; `DEMO-SCRIPT.md` the recording outline.

## ERP invoice analysis and reports

Inline invoice dates, amount-in-words prefixes before GRAND TOTAL, Rs./INR amounts, Indian grouping, GST formula summaries and signed round-off values are supported. GST INVOICE and GSTIN headings are not treated as tax values. Round-off participates in the arithmetic check. Unknown currencies are displayed explicitly rather than defaulting to USD. Unregistered suppliers and missing purchase orders remain review cases; extraction success does not invent procurement approval.

Open any saved run and choose **Download report PDF** for a readable report of fields, findings and traceability. **Recheck analysis** re-reads its saved source text with the current parser and shows an explicitly marked preview; it changes no saved decisions or balances. The preview PDF uses the current analysis. Other duplicate claims and PO commitments still apply. Original files and prior decisions remain intact. JSON export and review-note copying follow the currently displayed analysis.

## Currency recognition

Currency is detected from ISO codes, rupee symbols and abbreviations (INR, Rs., Re., rupee wording), euro/pound indicators and country-qualified dollar notation (US$, A$/AU$, C$/CA$). The interface names the currency, formats INR using Indian grouping, shows detection evidence, and includes an Invoice currency check. Bare $ indicators, missing currencies, unsupported declarations and conflicting indicators require confirmation rather than defaulting to USD or INR. Invoice amounts never inherit a purchase order currency; PDF PO balances retain their own PO currency. Older runs can use Recheck analysis for the latest reading.
