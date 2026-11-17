# NEXT — QR-EAT-B1-W-PRINT-MODE-WEB

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-17

Task contract: `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md`
Task revision: 1 (approved 2026-11-17)

Current step: **MERGED & DEPLOYED** — `c78f773`, merge `d63bdbc`, Railway
deployment `c4d79c4b…` **SUCCESS**, health **UP**, loyalty/HMAC unset.
QR-Eat B1 is complete; B2 is a Tabtep task.

Completed:
- W1–W5 implemented on `feat/b1-w-print-mode-web` from `main` `f63096c`.
- Desktop/mobile card and create-form screenshots plus a forced-400 revert
  screenshot in `evidence/`.
- Type-check PASS; targeted 2 suites/14 tests; full 130 suites/1567 passed,
  11 skipped; build PASS.

Next action:
1. B2 starts as a separate Tabtep task (Counter auto-print, ack UI, setup
   prompt, READY/SERVED when Kitchen absent).
2. Do not enable loyalty, set the HMAC key, run seed or edit Tabtep from this
   QR-Eat session.
4. Fresh `ame-verifier`; record `REVIEW-01.md`.
5. R2 commit gate: exact paths, evidence, screenshots, human approval.

Blockers:
- B1-S API must be merged first.
- B2 must not start until B1-W is merged.

Guardrails:
- No printer IP/credentials, new page shell, schema, seed, loyalty, deploy,
  push or Tabtep edit.
- Do not duplicate server print validation; import the shared enum/type.
