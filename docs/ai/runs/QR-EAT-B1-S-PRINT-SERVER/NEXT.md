# NEXT — QR-EAT-B1-S-PRINT-SERVER

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-17

Task contract: `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md`
Task revision: 1 (approved 2026-11-17)

Current step: **APPROVED — not started.**

Next action:
1. Confirm B1-S is the active task and `main` is clean.
2. Hand `TASK.md` to one `ame-implementer` with the frozen contract.
3. Implement S0–S6; stop at the first contract conflict.
4. Fresh `ame-verifier`; record `REVIEW-01.md`.
5. R3 commit gate: exact paths, diff hash, evidence, human approval. Do not
   push/deploy.

Blockers:
- None, after B1-C owner approval and O-9 push.
- B1-W waits for B1-S API merge; B2 waits for B1-S + B1-W.

Guardrails:
- No loyalty, HMAC key, seed run, migration, manual deploy, push or Tabtep edit.
- Do not edit the frozen contract; report a conflict instead.
