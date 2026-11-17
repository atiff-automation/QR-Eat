# Run Log — QR-EAT-B1-W-PRINT-MODE-WEB (B1-W)

**Task:** `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md`
**Risk:** R2 · **Workflow:** FEATURE / UI
**Status:** APPROVED — ready; B1-S merged/deployed
**Date:** 2026-11-17
**Base:** `6d59a56` (B1-S merge commit)
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`

## Approval

- Owner O-7 approved: B1-S API + B1-W web `printMode` control before B2.
- O-6 approved the new-onboarding `COUNTER` default and the B2 setup prompt.
- B1-W does not touch auth, RBAC, payments, migrations or server print routes.

## Scope

Add the owner-facing station `printMode` control to the existing
`/dashboard/stations` page, with guidance, the `COUNTER` create default,
permission/UX states, tests and screenshots. Consume the B1-S API; do not
redefine the enum or duplicate server rules.

## Baseline

Not run yet. At start, record the B1-S merge commit and:

```text
git status --short
npm run type-check
npx jest src/app/dashboard/stations src/components/stations
npm test -- --runInBand
npm run build
```

## Evidence

Pending implementation. Record screenshots (desktop/mobile), keyboard and
screen-reader checks, test names/counts and the review file.

## Residual risk (planned)

- The server does not know whether a Counter printer is physically configured;
  the UI must not claim readiness.
- A manager needs a custom `restaurant:settings` grant; the seeded manager
  remains unable to manage stations.
- B2 owns the Counter setup prompt; B1-W only provides web guidance.

## No-claims

No code or config change has been made by this task yet.
