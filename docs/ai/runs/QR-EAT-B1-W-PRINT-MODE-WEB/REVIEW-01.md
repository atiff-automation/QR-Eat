# Review 01 — QR-EAT-B1-W-PRINT-MODE-WEB

**Task:** `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md` revision 1
**Verifier:** fresh `ame-verifier`, session `ses_e170f490fffeW7RMjL7cmaFMAz`
**Implementer:** `ses_e17245d37ffeCT3Pao7QQA2Yh9`
**Date:** 2026-11-17
**Risk:** R2
**Base:** `main` `f63096c` (B1-S code `6d59a56`)
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md` §4, §11.3, §13.3

## Verdict

**PASS WITH NOTES.** No Blocker or High finding. The print-mode control meets
W1–W5 and acceptance criteria 1–12. Correction cycle 1 closed the page loading/
alert gap and stale-status issue; the remaining notes are recorded and
non-blocking. The R2 commit gate is ready.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| R-01 | Medium | Recorded product+new hash was stale after the button-wrap fix. | **Closed** — hashes recomputed and matched by the verifier: tracked `19e21b3…`; product+new `cf9f245…`. |
| R-02 | Medium | Initial data load rendered “No stations/devices yet”; page error had no `role="alert"`. | **Closed** — `aria-busy`, `role="status"` loading states replace empty copy during load, page error is `role="alert"`, test pins it. |
| R-03 | Low | New product file count said 5; actual 4. | **Closed** — 4 new product files plus the modified page. |
| R-04 | Low | “Playwright checks” not reproducible from repo. | **Closed** — run log now states a temporary Playwright 1.65 spec outside the repo with installed Chrome; no dependency added; spec/credentials not committed. |
| R-05 | Low | Client re-declares fallback/onboarding default literals. | **Recorded note** — not a second enum; values are typed `PrintMode` and tested against `PRINT_MODES`. Drift risk stays recorded. |
| R-06 | Low | Per-station save status could survive refresh. | **Closed** — drafts/status cleared at `load()` start; same-save success is set after and survives. |
| R-07 | Note | Repeated “Save print mode” names across cards. | **Recorded note** — card heading supplies station context; no change. |
| R-08 | Note | Counter reminder shows on every COUNTER control, not only new. | **Recorded deviation** — persistent, non-blocking, accurate, never claims readiness. |
| R-09 | Note | No jsdom/RTL; tests use `renderToStaticMarkup`. | **Recorded deviation** — repo lacks jsdom and dependencies are prohibited; interactive save/revert is browser-verified. |
| R-10 | Note | Pre-existing mobile “Edit categories” wrap. | Not introduced by B1-W; no scope expansion. |
| N-01 | Note | `aria-busy` on the root may defer announcing the nested loading status. | Recorded; visible text still communicates loading. |
| N-02 | Note | Awaiting `load()` now clears unrelated unsaved print-mode drafts. | Intentional R-06 trade-off; recorded. |
| N-03 | Note | Run-log status line was stale. | **Closed** in the run log. |

## Verified

- **W1:** current mode shown on every card; missing/unknown → `STATION`;
  `printMode` typed from `@/lib/station-settings`.
- **W2:** three-value select saves through `PATCH /api/stations/{id}` with
  `settings.printMode`; no second endpoint; saving/success/error states; failed
  save drops the draft, restores the server-confirmed value and shows the server
  message with retry; no optimistic value left.
- **W3:** create form defaults `COUNTER`, sends it explicitly, explains all
  three modes; non-blocking Counter printer reminder; no readiness claim.
- **W4:** owner `restaurant:settings` gate unchanged; loading/empty/error/
  success/saving/permission/mobile states; keyboard operable; label and
  `aria-describedby`; 40px control; text+icon status.
- **W5:** 2 suites/15 tests pin mapping, approved copy, fallback, create
  default, label/description, dirty gating, success/error roles and the owner
  gate; full suite/build green; five card-level screenshots committed.
- **No duplicate print/routing rule** and no printer IP/credential/address.
- **No schema/seed/loyalty/deploy/B2/Tabtep change.**

## Evidence

```text
git status --short                 → page.tsx + 3 run docs modified; 4 new product files; 5 PNGs
git diff --check                   → clean
npm run type-check                 → PASS
npx jest src/components/stations src/app/dashboard/stations --runInBand
                                   → 2 suites, 15 tests PASS
npm test -- --runInBand            → 130 suites passed, 1 skipped; 1568 passed, 11 skipped
npm run build                      → PASS
npx eslint changed files           → exit 0
npx prettier --check changed files → clean
```

Hashes:

- tracked product: `19e21b33535d2cc0e7b9711ad35d23823281e6c71173b92f04d9f7aac35b0cea`
- product + new: `cf9f24552108862f64a76307c3b6976531e60d662cd681001b6389b13e00c6a9`
- new product files: 4

Screenshots (card-level, no PII):

- `evidence/desktop-station-card.png`
- `evidence/desktop-create-card.png`
- `evidence/mobile-station-card.png`
- `evidence/mobile-create-card.png`
- `evidence/desktop-station-card-forced-400.png`

## Not verified

- End-to-end UI save against a running server/DB was browser-verified on local
  `qrorder_dev`, not by the verifier (no DB/seed allowed).
- No automated DOM test for the interactive save/revert path (no jsdom).
- Tablet-width rendering; desktop 1024px and mobile 390px only.
- Real Counter printer readiness (by design unverifiable server-side).

## Residual risk

- Interactive save/revert success path has no automated DOM test.
- Fallback/onboarding defaults are literals in the client (R-05 drift risk).
- Counter printer state is unknown to the dashboard; copy deliberately avoids a
  readiness claim.
- Manager still needs a custom `restaurant:settings` grant.
- B2/Counter hardware is untouched and not started.

## Gate

**Ready for the R2 commit gate.** The five card screenshots and both hashes are
the review-bound evidence. The owner instruction of 2026-11-17 authorizes the
commit, merge and automatic Railway deployment, with no manual deploy, seed,
loyalty change or B2 start.
