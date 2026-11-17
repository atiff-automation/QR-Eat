# Task — QR-EAT-B1-W-PRINT-MODE-WEB (B1-W)

**Status:** IMPLEMENTATION COMPLETE — verifier **PASS WITH NOTES**; correction
cycle 1 done; all findings closed; **ready for R2 commit gate**
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff (O-7, 2026-11-17)
**Approval date:** 2026-11-17
**Next actor:** human R2 commit gate, then merge and automatic Railway deploy
**Risk:** **R2** — station configuration UI, operational print policy
**Workflow:** FEATURE / UI
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`, frozen `39031bb`
**Server dependency:** `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md`
**Base:** `6d59a56` (B1-S merge commit; `printMode` API deployed)
**Updated:** 2026-11-17

> B1-W exists because the owner approved O-7: **B1-S API + B1-W web control
> before B2.** The web must not duplicate server print rules, store a printer
> address, or ship a second source of truth for the enum.

## Objective

Add an owner-facing web control for each station’s print policy:

- `STATION` — the Kitchen/Station device prints that station’s tickets;
- `COUNTER` — the Counter prints that station’s tickets; no Kitchen device is
  required;
- `NONE` — no paper; display/KDS only; no Kitchen device is required.

New stations default to `COUNTER` (Q4/O-6). The UI must explain that choice and
prompt the owner to set up the Counter printer before service. The Counter
setup prompt itself is a B2 client concern; B1-W provides the web guidance and
the control.

## Approved decisions

- O-6: new onboarding defaults `COUNTER`; B2 adds the Counter setup prompt.
- O-7: B1-S API + B1-W web `printMode` control before B2.
- Q4: `printMode: STATION | COUNTER | NONE`; existing stations are `STATION`
  when the key is missing; Kitchen sends `SKIPPED` when it is not the authority.
- C-1: missing/invalid `printMode` reads as `STATION`; new onboarding writes
  `COUNTER`.
- C-13: a non-authority device skip is audit-only; the web must not present
  `SKIPPED` as a printer failure.

Do not re-open these decisions.

## Scope

### W1 — Read and display the current mode

- Extend the station view model in
  `src/app/dashboard/stations/page.tsx` to carry `settings.printMode`, defaulting
  to `STATION` when absent.
- Show the mode on every station card with a clear label and a one-line
  explanation. Do not use colour alone; use text plus a status badge or a
  labelled select.
- Preserve the existing page shell, shared `Button`, `LoadingSpinner`,
  `ConfirmationModal`, card tokens and responsive layout
  (`docs/WEB-UI-STANDARD.md`).

### W2 — Change the mode

- Add a labelled select or segmented control with the three values.
- Save through the existing `PATCH /api/stations/{id}` with
  `settings: { printMode }`. Do not add a second endpoint.
- Show saving, success and error states; a failed save must leave the previously
  saved value visible and explain the retry.
- Validate client-side to the same three values, but treat the server as
  authoritative. Do not duplicate routing or print rules.
- Do not store or display a printer IP, port, credential or driver.

### W3 — Create-station default and guidance

- The create form defaults to `COUNTER`. If B1-S’s create schema accepts
  `printMode`, send it explicitly; otherwise rely on the server default and do
  not invent a second default in the client.
- Add plain-language guidance:
  - `STATION`: “The Kitchen device prints this station’s tickets.”
  - `COUNTER`: “The Counter prints this station’s tickets. No Kitchen device is
    required. Set up the Counter printer before service.”
  - `NONE`: “No paper. This station is display only. No Kitchen device is
    required.”
- When a new station is `COUNTER`, show a non-blocking setup reminder. Do not
  claim the printer is configured; the server does not know printer state.
- Use canonical vocabulary from `docs/TERMINOLOGY.md`: **Counter**, **Kitchen**,
  **Station**, **Kitchen ticket**. Do not call an order a ticket.

### W4 — Permission and states

- The page already gates on `restaurant:settings` and shows an owner-only
  message. Keep that gate. On the seeded templates only `restaurant_owner` has
  it; a manager needs a custom grant. Do not widen the permission for B1-W.
- Cover loading, empty (no stations), error, success, saving, permission-denied
  and mobile states.
- Keyboard operable; visible focus; label associated with the control; 40px
  control height; adequate contrast.
- No optimistic update that could hide a server rejection.

### W5 — Tests and evidence

- Extract the presentational control/helper if it makes testing clean; add a
  React Testing Library test if a component is extracted.
- At minimum, test the mode→label/description mapping and the create default.
- Add or update API-level tests only if B1-W changes a route; it should not.
- Evidence: type-check, targeted tests, full tests, build, and a screenshot of
  the station card/create form at desktop and mobile widths.
- No B2/Counter app change.

## File ownership (expected)

```text
src/app/dashboard/stations/page.tsx
src/components/stations/**                          (only if a shared control is extracted)
src/lib/station-settings.ts                         (read-only import; B1-S owns the enum)
docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/**
docs/WEB-UI-STANDARD.md                             (only if a new pattern is added; avoid)
```

Sensitive-area note: this task does **not** touch auth, RBAC, device auth,
payments, migrations or the server print routes. It consumes the B1-S API. If
the page needs a new permission or route, stop and escalate.

## Not in scope

- B1-S server implementation (printMode storage, acks, no-Kitchen guard,
  cashier status).
- B2 Counter auto-print, client setup prompt, READY/SERVED.
- B3 QR/all orders or the Counter feed.
- Printer discovery, IP entry, LAN pairing, driver or credential storage.
- Schema/migration/seed, loyalty, deploy/push, Tabtep edits.
- A new dashboard page or a parallel station settings shell.

## Acceptance criteria

1. An owner with `restaurant:settings` sees the current `printMode` for every
   station; a missing key displays `STATION`.
2. The owner can change a station to any of the three values and the change
   persists through `PATCH /api/stations/{id}`.
3. An invalid value is refused by the server; the UI shows the error and keeps
   the last saved value.
4. The create form defaults to `COUNTER` and explains the three modes in plain
   language.
5. A new `COUNTER` station shows a non-blocking “set up the Counter printer”
   reminder; it never claims the printer is configured.
6. The page keeps its existing owner-only gate; no manager/cashier widening.
7. Loading, empty, error, success, saving, permission-denied and mobile states
   are present and accessible.
8. No printer IP/credential is stored, displayed or sent to the server.
9. The UI imports the enum/type from the server-owned module rather than
   redefining a second enum.
10. `npm run type-check`, targeted tests, `npm test -- --runInBand` and
    `npm run build` pass; desktop/mobile screenshots are attached.
11. No schema/seed/loyalty/deploy/push or Tabtep edit occurs.
12. Independent verifier PASS or PASS WITH NOTES.

## Verification

```bash
git status --short
git diff <task-base>..HEAD --stat
npm run type-check
npx jest src/app/dashboard/stations src/components/stations
npm test -- --runInBand
npm run build
git diff --check
```

Manual/UX evidence:

- desktop and mobile screenshots of the station card and create form;
- keyboard-only pass on the select and save;
- screen-reader name/description check for the control;
- error path: force a 400/403 and confirm the UI keeps the saved value.

## Review focus

- Does the UI invent a print rule or duplicate server validation?
- Does a missing key read as `STATION` everywhere?
- Is the new-station default `COUNTER` explicit and explained?
- Does the page leak printer configuration or overpromise printer readiness?
- Is the owner-only gate intact, with no manager/cashier widening?
- Are empty/loading/error/success/mobile states complete and accessible?
- Does the page still match `docs/WEB-UI-STANDARD.md`?

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`
- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` §4, §11.3, §13.3
- `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md` (API shape)
- `src/app/dashboard/stations/page.tsx`
- `src/lib/station-settings.ts`
- `docs/WEB-UI-STANDARD.md`, `docs/TERMINOLOGY.md` (Station/Kitchen/Counter)
- `src/components/ui/Button.tsx`, `LoadingSpinner.tsx`,
  `ConfirmationModal.tsx`

**Read only if unclear:**

- `src/app/api/stations/[id]/route.ts` (PATCH shape)
- `src/lib/api-client.ts`
- existing dashboard form/select patterns
- existing RTL test setup

**Do not read by default:**

- the whole repository or `docs/ai/` tree;
- server print-ack/order-event internals beyond the API shape;
- `../Tabtep-App` source;
- generated output, lint/tsc logs.

## Commit gate

R2 web change: exact path list, verification evidence, independent review
verdict, and explicit human commit authorization. The implementer does not
commit, push or deploy. B1-W starts only after B1-S is merged.

## Stop point

Stop after the web control, tests, screenshots and review. Do not start B2.
