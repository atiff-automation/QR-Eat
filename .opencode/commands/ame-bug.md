---
description: Run the AME bug workflow with investigation before implementation
agent: ame-lead
subagent: false
---

Use the BUG workflow.

Task: $ARGUMENTS

Requirements:

1. Classify severity, risk, and specification level.
2. L1: use a single `docs/ai/runs/<task-id>.md` run log and read only the
   relevant files.
   L2/L3: create `docs/ai/runs/<task-id>/TASK.md`, `RUN_LOG.md`, and `NEXT.md`.
   Include a context budget in the task: must read / read only if unclear /
   do not read.
3. For L2/L3, update `docs/ai/ACTIVE.md` from the template.
4. Define expected vs actual behaviour and reproduction.
5. Load `ame-debugging` before investigating.
6. Build a red-capable feedback loop before hypothesising.
7. Confirm root cause or state uncertainty.
8. If the fix changes behaviour, scope, data, auth, payment, or API, load
   `ame-grilling` and resolve the design questions before implementation.
9. Request approval for R2/R3 or any business-rule change.
10. Hand the approved fix to exactly one `ame-implementer` child. Do not edit
    product code in the Lead session.
11. Require the implementer to add regression coverage.
12. Set `Status: awaiting_review`, `Next actor: verifier`, and update `NEXT.md`.
13. Request independent verification with `ame-verifier`.
14. L1/L2 PASS: record verdict and evidence in `RUN_LOG.md`.
    L2 FAIL/notes or L3: write `REVIEW-01.md` from the verifier's report.
15. If FAIL, use `/ame-fix` with the review path; do not merge.
16. For R2/R3, set `Status: ready_to_commit`, `Next actor: human`, and stop at
    the commit gate.

Do not fix the symptom without diagnosing the cause.
Do not claim fixed unless the original reproduction was re-run.
Do not verify your own code.
