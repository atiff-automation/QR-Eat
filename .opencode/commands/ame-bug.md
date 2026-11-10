---
description: Run the AME bug workflow with investigation before implementation
agent: ame-lead
subagent: false
---

Use the BUG workflow.

Task: $ARGUMENTS

Requirements:

1. Classify severity, risk, and specification level.
2. L1: use a single `docs/ai/runs/<task-id>.md` run log.
   L2/L3: create `docs/ai/runs/<task-id>/TASK.md` and `RUN_LOG.md`.
3. Define expected vs actual behaviour and reproduction.
4. Load `ame-debugging` before investigating.
5. Build a red-capable feedback loop before hypothesising.
6. Confirm root cause or state uncertainty.
7. Request approval for R2/R3 or any business-rule change.
8. Make the smallest correct fix.
9. Add regression coverage.
10. Request independent verification with `ame-verifier`.
11. L1/L2 PASS: record verdict and evidence in `RUN_LOG.md`.
    L2 FAIL/notes or L3: write `REVIEW-01.md` from the verifier's report.
12. If FAIL, use `/ame-fix` with the review path; do not merge.
13. For R2/R3, stop at the commit gate.

Do not fix the symptom without diagnosing the cause.
Do not claim fixed unless the original reproduction was re-run.
Do not verify your own code.
