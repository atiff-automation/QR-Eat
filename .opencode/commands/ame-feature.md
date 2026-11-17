---
description: Run the AME feature workflow with grilling, spec, UX gate, contract, build, and verification
agent: ame-lead
subagent: false
---

Use the FEATURE workflow.

Task: $ARGUMENTS

Requirements:

1. Classify complexity, risk, and specification level.
2. If the input is an approved `TASK.md` revision, do not re-plan. Verify
   `Revision == Approved revision`, then continue at implementation.
3. L1: use a single `docs/ai/runs/<task-id>.md` run log.
   L2/L3: create `docs/ai/runs/<task-id>/TASK.md`, `RUN_LOG.md`, and `NEXT.md`.
4. Read the project profile, architecture, glossary, and relevant code.
5. Update `docs/ai/ACTIVE.md` from the template. It is a pointer only.
6. For L2/L3, load `ame-grilling` and grill the human in rounds before writing
   the final task:
   - inspect facts yourself;
   - ask the current frontier;
   - give a recommended answer for each question;
   - wait for answers;
   - stop when no important branch is unresolved.
7. Specify outcome, scope, non-goals, decisions, and acceptance criteria.
8. For user-facing work, define the UX flow and UI states before implementation.
9. Challenge gaps, edge cases, alternatives, security, data, and cost.
10. Plan boundaries, API/data contract, frontend/backend ownership, and tests.
11. Write the task, including a context budget (must read / read only if unclear /
    do not read); set `Status: planning`, `Next actor: human`, and ask for
    approval of the exact revision.
12. After approval, update the task header:
    - `Status: ready_for_implementer`
    - `Approved revision: <revision>`
    - `Next actor: implementer`
    - update `Updated:`
    Then update `NEXT.md`.
13. Stop after approval. Do not implement in the Lead session. Hand the task to
    `/ame-implement` or spawn exactly one `ame-implementer` child.
14. After the implementer returns, set `Status: awaiting_review`,
    `Next actor: verifier`, and update `NEXT.md`.
15. Request independent verification with `/ame-verify` or a fresh
    `ame-verifier` child.
16. L1/L2 PASS: record verdict and evidence in `RUN_LOG.md`.
    L2 FAIL/notes or L3: write `REVIEW-01.md` from the verifier's report.
17. If FAIL, use `/ame-fix` with the review path; do not merge.
18. For R2/R3, set `Status: ready_to_commit`, `Next actor: human`, and stop at
    the commit gate. Use `/ame-commit`.

Load `ame-handoff` when delegating and `ame-engineering-discipline` when planning
or implementing.

Do not start with code if the UX flow, API contract, acceptance criteria, or
grilled decisions are unresolved.
Do not verify your own code.
