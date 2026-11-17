# InvoicePilot · verification record

Verified on 17 November 2026, against the PS-1 requirements in the ASA candidate guide. Deployment and the candidate's recording are intentionally outside this handoff.

## Requirements coverage

| Application requirement | Implemented and checked |
| --- | --- |
| Real input and real output | Text PDF, image-only PDF, PNG and JPEG went through browser extraction, server checks and saved decisions. Sample buttons fetch real PDF bytes and use the same pipeline as uploads. |
| Messy invoice input | Known supplier aliases, invoice-label variants, written dates, next-line amounts, separate tax, pipe-separated itemised lines, absent totals and ambiguous fields. Unsupported or uncertain cases are handed off or show an explicit error. |
| Procurement logic | Approved supplier, PO existence/ownership/status, currency, partial invoicing, cumulative tolerance, arithmetic and duplicate checks. |
| Reasoned decision | Approved / Needs review / Rejected, with each check, source-field evidence, raw text, file fingerprint and PO reconciliation visible. |
| Visible execution | Actual document reading/OCR, extraction, validation, matching and decision stages. Server stage events are retained with the run. |
| Intuitive interface | Overview, upload dialog, queue, search/status filters, purchase-order view, run details and demo playbook. Desktop and 390-pixel responsive viewport inspected. No page-wide horizontal overflow was observed. |
| History and outputs | Persistent SQLite locally; Worker API for D1/R2 in production. Reloaded run history, source access, balances, JSON/CSV downloads and reviewer-note copying checked. |
| 2–4 realistic edge cases | Four principal scenarios below, plus additional currency/OCR/error checks. |

## Browser runs observed

Testing used a separate local database and upload directory; the candidate's existing local invoice history was preserved.

| Scenario | Observed result |
| --- | --- |
| Clean invoice INV-1048 for USD 4,500 | Approved against PO-2026-041; 4,500 committed. |
| Same invoice again | Rejected as duplicate; allocation unchanged. |
| Second milestone INV-1050 for USD 7,000 | Approved; cumulative commitment 11,500. |
| Third invoice INV-1051 for USD 1,500 | Needs review; projected 13,000 exceeds 12,000 plus 50 tolerance. Remaining balance shown as 500. |
| Orbit OC-882 without a PO reference | Needs review; both PO-2026-043 and PO-2026-044 displayed. |
| Incomplete image-only Northstar scan | OCR extracted supplier, number, date and PO; missing total remained empty and triggered review. |
| Complete image-only Northstar scan | OCR extracted the USD 550 invoice and it was approved against PO-2026-042. |
| Different layout / NS-3093 | Written date normalised, next-line subtotal read, percentage tax extracted, item quantity/price checked; USD 2,200 approved. |
| EUR invoice against USD PO | Needs review; no conversion or cross-currency projection. |
| PNG and JPEG of an already approved invoice | Real OCR completed; duplicate detected across different file formats. |
| Manually transcribed MANUAL-101 | Needs review even though its ordinary required/PO fields passed. |
| Password-protected PDF | Clear request for an unlocked copy; no approval. |
| Eleven-page PDF | Clear 10-page limit error; no approval. |
| Damaged PDF | Clear unreadable/unsupported PDF error; no approval. |
| Reviewer note | Copied text verified after the copy confirmation. |
| Decision JSON and history CSV | Actual downloads produced. |
| Queue search + review filter | Four review records filtered to the single OC-882 row. |
| PO dashboard | Aster 11,500 committed / 500 left; Northstar 2,750 committed / 3,250 left, matching approved runs. |
| Mobile overview | Navigation, upload action, summary cards and content remained usable; no document-wide overflow. |

## Automated checks

57 tests pass, plus JavaScript syntax and ESM artifact validation. They cover field extraction, actual PDF fixture text, date and money formats, conflicting fields, missing numbers, separate tax components, OCR score validation, arithmetic, supplier/PO checks, tolerance boundaries, API persistence, concurrent duplicate submission, concurrent overbilling, full-ledger balances, identity isolation, document access, demo reset, invalid file signatures, cross-origin writes and route rendering.

The SQL integration tests use Node SQLite with the same statements as the Worker. They do not substitute for a deployment smoke test of the actual hosted D1/R2 bindings.

## Final deployment smoke test for the candidate

After deploying, open the published URL as its intended reviewer, check that access works, then run a clean sample, a duplicate, the partial/overbilling sequence, an ambiguous PO and a scan. Reload the queue to confirm persistence, open a source document and download a decision. Only then record the five-minute video.

## Explicit scope

OCR is the machine-learning component; no LLM is claimed. The extraction engine has a defined English-label scope and does not guarantee every possible invoice layout. Missing or conflicting critical fields require review. Approved means eligible for AP approval; no payment is made. The synthetic procurement dataset, policy assumptions and lack of an in-app correction-and-approval flow are documented in PROJECT-GUIDE.md. Those downstream functions are not required by PS-1's invoice-to-decision brief.

## Vercel + Supabase adaptation

Nine additional tests run the actual PostgreSQL schema through PGlite and the Vercel adapter through a controlled Supabase Auth/Storage fixture. They verify owner RLS, denied browser writes/RPC execution, duplicate claims, cumulative allocations, upload reservation ownership/expiry, idempotent persistence, refresh/logout cookies, CSRF checks, source isolation, signed redirects, JSON-only processing, missing configuration, rewritten POST bodies and a direct upload larger than 4.5 MB. The production API does not use the fixture. Actual hosted integration remains a deployment smoke test with your project credentials.

Browser verification of the adapter used that controlled fixture: invalid password handling, successful sign-in, a real PDF through signed direct upload and processing, duplicate rejection, complete scanned-PDF OCR, persistence after reload, sign-out and a second account with four zero summary counts were observed. No live Supabase service or Vercel deployment was used for these browser checks.

## ERP regression and PDF reports

Seven added tests cover a synthetic ERP/GST layout, inline dates, Rs./Indian money grouping, tax heading boundaries, repeated GST calculations, round-off arithmetic, conflicting currencies, valid PDF output, immutable rechecks and owner isolation. Vercel contract checks also cover report attachment headers and protected recheck/report endpoints. The real uploaded layout was diagnosed locally; no customer document, banking information or contact details are included in the test fixtures or source archive.

## Currency regression checks

Five currency tests cover rupee spellings/symbols, INR grouping, country-qualified dollar notation, absent or ambiguous currencies, conflicting indicators and independent invoice/PO currency labels in the PDF. UI checks assert that INR amounts use the rupee symbol and missing invoice currency is never replaced with the PO currency. All 57 tests pass.
