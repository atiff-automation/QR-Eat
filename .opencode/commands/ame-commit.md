---
description: Run the AME commit gate and commit only an exact human-approved path list
agent: ame-lead
subagent: false
---

Use the commit gate. This is not a place to fix code or widen scope.

Commit: $ARGUMENTS

Requirements:

1. Confirm the task is at `Status: ready_to_commit` and `Next actor: human`.
2. Confirm a matching `REVIEW-<n>.md` exists with verdict `PASS`.
3. Confirm the review's base commit and diff hash match the current diff.
4. Confirm changed files are within the `TASK.md` owned files.
5. Confirm the implementer and verifier session IDs are recorded.
6. Publish the exact path list and exact commit message.
7. Ask the human for explicit authorization. Do not commit on silence.
8. After approval, commit only the listed paths. Do not add unrelated files.
9. Record the commit hash, authorization, and final status in `RUN_LOG.md` and
   `NEXT.md`.
10. Stop. Do not push, merge, tag, or deploy unless separately authorized.

Refuse the gate if the review is missing, stale, not PASS, or not bound to the
current diff. Refuse if the path list is incomplete or contains unrelated work.
