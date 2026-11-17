# Run Log — QR-EAT-B1-W-PRINT-MODE-WEB (B1-W)

**Task:** `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md` revision 1
**Risk:** R2 · **Workflow:** FEATURE / UI
**Status:** **MERGED & DEPLOYED** — verifier **PASS WITH NOTES**; commit
`c78f773`; merge `d63bdbc`; Railway deployment
`c4d79c4b-5414-4413-b904-af1219a42f58` **SUCCESS**; health **UP**; loyalty/HMAC
unset
**Date:** 2026-11-17
**Branch:** `feat/b1-w-print-mode-web` (base `main` `f63096c`; B1-S code `6d59a56`)
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`
**Implementer:** one `ame-implementer` (`ses_e17245d37ffeCT3Pao7QQA2Yh9`)

## Approval

- Owner O-7 approved B1-S API + B1-W web control before B2.
- O-6 approved the new-onboarding `COUNTER` default and B2 setup prompt.
- B1-W does not touch auth, RBAC, payments, migrations or server print routes.

## Scope delivered

- Station card shows the current `printMode`; missing key reads as `STATION`.
- Labelled 40px select with `STATION` / `COUNTER` / `NONE`, one-line guidance
  and an accessible description.
- Save through the existing `PATCH /api/stations/{id}` with
  `settings: { printMode }`; no second endpoint.
- Saving, success and error states. A failed save drops the unconfirmed draft
  and keeps the last server-confirmed value visible, with a retry message.
- Create form defaults to `COUNTER`, sends `printMode` explicitly, explains all
  three modes and shows a non-blocking Counter-printer setup reminder.
- No printer address, credential, driver or readiness claim.
- Existing `restaurant:settings` owner gate and page shell preserved.

## Files changed

Modified:

```text
src/app/dashboard/stations/page.tsx
```

New:

```text
src/components/stations/print-mode.ts
src/components/stations/PrintModeField.tsx
src/components/stations/__tests__/print-mode.test.tsx
src/app/dashboard/stations/__tests__/page.test.tsx
```

Evidence:

```text
docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/evidence/desktop-station-card.png
docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/evidence/desktop-create-card.png
docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/evidence/mobile-station-card.png
docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/evidence/mobile-create-card.png
docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/evidence/desktop-station-card-forced-400.png
```

Diff hashes:

- tracked product: `19e21b33535d2cc0e7b9711ad35d23823281e6c71173b92f04d9f7aac35b0cea`
- product + new (intent-to-add + diff): `cf9f24552108862f64a76307c3b6976531e60d662cd681001b6389b13e00c6a9`
- new product files: 4 (plus the modified page)

## Tests

Test files pin:

- `PRINT_MODE_OPTIONS` covers exactly `PRINT_MODES` in order.
- Approved `STATION` / `COUNTER` / `NONE` guidance strings.
- Missing/null/unknown `printMode` → `STATION`; valid values pass through.
- Create default is `COUNTER`.
- Field label/`aria-describedby`, selected value, save disabled until dirty.
- Counter reminder present; no readiness/IP/credential claim.
- Success `role="status"`, error `role="alert"`, saving state, disabled states.
- Owner gate still hides the page without `restaurant:settings`.
- Page create form defaults to `COUNTER` and shows the reminder.

## Verification

| Check | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | **PASS** |
| Targeted UI tests | `npx jest src/components/stations src/app/dashboard/stations --runInBand` | **PASS** — 2 suites, 15 tests |
| Full tests | `npm test -- --runInBand` | **PASS** — 130 suites passed, 1 skipped; **1568 passed, 11 skipped** |
| Build | `npm run build` | **PASS** (after stopping the dev server and clearing `.next`) |
| Whitespace | `git diff --check` | clean |
| Format | `npx prettier --check` changed files | clean |
| Lint | `npx eslint` changed source/tests | clean |

## Screenshots and UX evidence

Captured against the local `qrorder_dev` database and local dev server, not
production. The screenshots are card-level crops, so they contain no account
email, sidebar PII or devtools overlay.

| Evidence | What it shows |
|---|---|
| `desktop-station-card.png` | Desktop station card with `COUNTER` selected, guidance, reminder, one-line Save button |
| `desktop-create-card.png` | Desktop create form defaulting to `COUNTER` with all three modes and reminder |
| `mobile-station-card.png` | 390px station card; select and Save stack; reminder readable |
| `mobile-create-card.png` | 390px create form; guidance and reminder readable |
| `desktop-station-card-forced-400.png` | Forced PATCH 400: alert shown, select reverted to last saved `COUNTER`, no optimistic value left |

A temporary Playwright 1.65 spec (outside the repo, using the installed Chrome
channel; no dependency added) also confirmed:

- label `for` points at the select and `aria-describedby` is present;
- keyboard `ArrowDown`/`ArrowUp` changes the select;
- forced 400 keeps the saved value and shows the retry alert.

The button-wrap defect found in the first desktop screenshot was fixed with
`whitespace-nowrap` before the final evidence. The Playwright spec and local
credentials are not committed.

Verifier correction cycle 1 also added:

- `aria-busy` on the page content, `role="status"` loading states instead of
  the empty stations/devices copy during initial load, and `role="alert"` on
  the page error banner;
- clearing per-station print-mode drafts/status at the start of `load()` so a
  stale success/error cannot survive a refresh.

## Verifier report

`REVIEW-01.md` — **PASS WITH NOTES**, no Blocker/High. Correction cycle 1
closed the stale hash/count/Playwright wording (R-01/R-03/R-04), the initial
data-loading/`role="alert"` gap (R-02) and stale per-station save status (R-06).
R-05 (client default literals), R-07 (repeated save label), R-08 (reminder on
all COUNTER controls), R-09 (no jsdom/RTL) and R-10 (pre-existing mobile
"Edit categories" wrap) are recorded non-blocking notes.

## Deviations / notes

1. **No React Testing Library.** The repo has no `jsdom`/RTL environment and the
   task forbids adding a dependency. The tests use the existing
   `renderToStaticMarkup` pattern and cover the mapping, default and all control
   states. This is a testing-tool deviation, not a behaviour deviation.
2. **Counter reminder on every `COUNTER` control.** The task requires it for a
   new `COUNTER` station. It is persistent and non-blocking, so it also appears
   on existing `COUNTER` cards. It never claims readiness.
3. **Page intro copy changed** from “a kitchen phone prints only its station’s
   items” to mode-dependent wording, because the old sentence is no longer true.
4. **`Station.settings` is typed with `printMode` only** for read/display. The
   page sends only `{ settings: { printMode } }`, so server-side
   `mergeStationSettings` preserves the other settings.
5. No route, auth, RBAC, schema, seed, dependency, loyalty or Tabtep change.
6. The local dev DB was used for screenshots; no seed run, migration or
   production data action.

## Residual risk

- The interactive save/revert path is browser-verified, not covered by an
  automated DOM test (no jsdom).
- The dashboard cannot know whether a Counter printer is physically configured;
  copy deliberately avoids a readiness claim.
- The page is owner-only on seeded templates; a manager needs a custom
  `restaurant:settings` grant.
- Browser screenshots were captured at 1024px/390px; no tablet-width capture.
- No B2/Counter client or hardware verification.

## Merge, deployment and health — 2026-11-17

- Implementation commit: **`c78f773`** (`feat(stations): add owner print-mode
  control B1-W`), branch `feat/b1-w-print-mode-web`.
- Merge: **`d63bdbc`** (`merge: B1-W station print-mode control`, `--no-ff`) on
  `main`; pushed `f63096c..d63bdbc`.
- Railway auto-deployment:
  **`c4d79c4b-5414-4413-b904-af1219a42f58`**, commit `d63bdbc`, **SUCCESS**.
- `GET https://tabtep.app/api/health` → **200**:
  `status=UP`, `database=CONNECTED`, `env=production`,
  `edgeIp.source=x-real-ip`.
- `railway status` → service **Online**, deployment id above.
- `LOYALTY_ENABLED` **UNSET**; `LOYALTY_PHONE_HMAC_KEY` **UNSET**. No loyalty or
  HMAC change.
- No manual deploy, restart, seed, migration or B2 action.

## No-claims

No commit, push, deploy, seed, migration, loyalty/HMAC change or Tabtep edit was
made. B2 was not started.
