---
description: Request a fresh read-only AME verification and record a review bound to the exact diff
agent: ame-lead
subagent: false
---

Use the independent verification route. The Lead is read-only for product code.

Verification: $ARGUMENTS

Requirements:

1. Read `AGENTS.md`, the task's `TASK.md`, `NEXT.md`, and `RUN_LOG.md`.
2. Confirm `Status: awaiting_review` and `Next actor: verifier`.
3. Pin the base commit and collect:
   - tracked diff;
   - untracked files;
   - changed-file list;
   - diff hash or patch identity;
   - test commands and prior evidence.
4. Check that changed files are within the task's owned files. If not, stop and
   report a scope violation.
5. Spawn exactly one fresh `ame-verifier` child. It must not be the implementer
   session.
6. Give it the `TASK.md` path and revision, risk, base commit, diff, untracked
   files, diff hash, test commands, specialist findings, and review focus.
7. Record the verifier `sessionID` in `TASK.md` and `RUN_LOG.md`.
8. Write `REVIEW-<n>.md` from the verifier's report when required. Record the
   verdict, verifier session, base commit, and diff hash.
9. Route:
   - FAIL: `Status: correction_required`, `Next actor: implementer`; use
     `/ame-fix` and do not merge.
   - PASS WITH NOTES: record the notes and ask the human whether to accept or
     correct.
   - PASS: `Status: ready_to_commit` for R2/R3, otherwise close after the normal
     commit; set `Next actor: human`.
10. Update `NEXT.md` and stop.

Do not edit product code. Do not verify your own changes. Do not accept a review
that is not bound to the current diff.
