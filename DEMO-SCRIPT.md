# Five-minute recording plan

The local browser/OCR flow has been verified. Publish your runnable link and repeat the smoke test on that deployment before recording/submitting. Record your own narration so you can explain the implementation in the interview. No video has been recorded by this project.

Before recording: warm the OCR reader by running the scan, reset demo runs, and ensure PO-2026-041 has no other approved uploads.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:30 | Overview | AP teams read messy invoices and manually check purchase orders. This app makes the processing and decision visible. |
| 0:30–1:35 | Clean sample PDF | Actual PDF reading, extraction, required checks, PO matching and saved approval eligibility. Open the source and check trail. |
| 1:35–2:10 | Same PDF again | Duplicate rejected; original allocation remains unchanged. |
| 2:10–3:10 | Second milestone, then balance check | 4,500 + 7,000 commits 11,500. Another 1,500 exceeds the 12,000 PO plus 50 tolerance. Review is required. |
| 3:10–3:45 | Orbit missing-PO sample | Two plausible POs; show both and explain why guessing would be wrong. |
| 3:45–4:30 | Incomplete scan | Real OCR, but no total. The app preserves missing data and requests review. |
| 4:30–5:00 | Queue, export and limits | Saved decisions, reviewer note, bounded label parser and next improvement: reviewed corrections and broader extraction. |

If OCR is slow, show one strong edge case in the video and prepare the others for the interview. Maximum five minutes; no slides required.

Be ready to explain:

- Deterministic decisions are inspectable and separate from uncertain extraction.
- OCR uses machine learning; this build has no LLM integration.
- Approved means eligible for AP approval; there is no payment action.
- Unique claims and atomic allocation prevent simultaneous duplicate approval and overbilling.
- Missing fields, currency differences, multiple POs and weak OCR need human judgment.
- Next work: correction flow, broader extraction with field evidence, ERP integration and production monitoring.

Submission needs both a live runnable link and a recording link. A local URL is not an externally runnable submission.
