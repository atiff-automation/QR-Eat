---
description: Run the AME feature workflow with spec, UX gate, contract, build, and verification
agent: ame-lead
subagent: false
---

Use the FEATURE workflow.

Task: $ARGUMENTS

Requirements:

1. Classify complexity, risk, and specification level.
2. L1: use a single `docs/ai/runs/<task-id>.md` run log.
   L2/L3: create `docs/ai/runs/<task-id>/TASK.md` and `RUN_LOG.md`.
3. Read the project profile, architecture, glossary, and relevant code.
4. Specify outcome, scope, non-goals, and acceptance criteria.
5. For user-facing work, define the UX flow and UI states before implementation.
6. Challenge gaps, edge cases, alternatives, security, data, and cost.
7. Plan boundaries, API/data contract, frontend/backend ownership, and tests.
8. Request design and plan approval at the appropriate level.
9. Execute in bounded work.
10. Request independent verification with `ame-verifier`.
11. L1/L2 PASS: record verdict and evidence in `RUN_LOG.md`.
    L2 FAIL/notes or L3: write `REVIEW-01.md` from the verifier's report.
12. If FAIL, use `/ame-fix` with the review path; do not merge.
13. For R2/R3, stop at the commit gate.

Load `ame-handoff` when delegating and `ame-engineering-discipline` when planning or implementing.

Do not start with code if the UX flow, API contract, or acceptance criteria are unresolved.
Do not verify your own code.
