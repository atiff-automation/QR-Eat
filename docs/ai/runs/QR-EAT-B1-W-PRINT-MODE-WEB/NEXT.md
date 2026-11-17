# NEXT — QR-EAT-B1-W-PRINT-MODE-WEB

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-17

Task contract: `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md`
Task revision: 1 (approved 2026-11-17)

Current step: **APPROVED — blocked by B1-S merge.**

Next action:
1. Wait for B1-S to merge with the `printMode` API.
2. Rebase/branch from that merge; fill the base commit in `TASK.md`.
3. Implement W1–W5 against the existing `/dashboard/stations` page.
4. Fresh `ame-verifier`; record `REVIEW-01.md`.
5. R2 commit gate: exact paths, evidence, screenshots, human approval.

Blockers:
- B1-S API must be merged first.
- B2 must not start until B1-W is merged.

Guardrails:
- No printer IP/credentials, new page shell, schema, seed, loyalty, deploy,
  push or Tabtep edit.
- Do not duplicate server print validation; import the shared enum/type.
