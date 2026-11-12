---
description: Hand an approved AME task to exactly one implementer child and record its evidence
agent: ame-lead
subagent: false
---

Use the implementation handoff route. Product code is read-only to the Lead.

Task: $ARGUMENTS

Requirements:

1. Read `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, `docs/ai/ACTIVE.md`, and the
   task's `TASK.md`, `NEXT.md`, and `RUN_LOG.md`.
2. Resolve the task path from `ACTIVE.md` unless the user supplied a path.
3. Refuse to continue unless:
   - `Revision == Approved revision`;
   - `Status: ready_for_implementer`;
   - `Next actor: implementer`;
   - the task has approved scope and owned files.
4. Do not edit product code yourself.
5. Spawn exactly one `ame-implementer` child with the task path:

```text
Implement docs/ai/runs/<task-id>/TASK.md revision <n>.
Return the required evidence. Do not commit or change scope.
```

6. Record the implementer `sessionID` in `TASK.md` and `RUN_LOG.md`.
7. Wait for the child. If its evidence is incomplete, continue the same child
   with its `sessionID`; do not start a second implementer.
8. When the child returns, verify the reported files against the owned files.
9. Set `Status: awaiting_review`, `Next actor: verifier`, and update `NEXT.md`.
10. Stop. Do not request review from the same session that implemented.

Do not let the Lead implement. Do not spawn more than one implementer. Do not
start Phase B or expand scope without a new approved revision.
