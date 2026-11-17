---
description: Recover the exact AME task state and next action after a break, compaction, crash, or new session
agent: ame-lead
subagent: false
---

Use the resume route. Read first; do not guess; do not edit until the human
confirms.

Context: $ARGUMENTS

Requirements:

1. Read `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, and `GLOSSARY.md`.
2. Read `docs/ai/ACTIVE.md`.
3. If `ACTIVE.md` is missing or says `Task: none`, list tasks whose `TASK.md`
   status is not `done` and ask which one to resume. Do not choose from chat
   history, timestamps, directory order, or the most recent file.
4. Read the exact task's `TASK.md`, `RUN_LOG.md`, `NEXT.md` if present, and the
   latest `REVIEW-*.md`.
5. Run:
   - `git status`
   - `git diff --stat`
   - `git log -3 --oneline`
6. Validate:
   - `ACTIVE.md` task matches the task directory;
   - `TASK.md` status and revision are coherent;
   - `Revision` and `Approved revision` match before implementation;
   - `NEXT.md` does not contradict `TASK.md`;
   - the branch and uncommitted files match the recorded work.
7. Report:

```text
Task:
Branch:
Status:
Revision / approved:
Next actor:
Completed:
In progress:
Uncommitted changes:
Latest review:
Blockers:
Open decisions:
Next action:
Mismatches:
```

8. If anything conflicts, stop and explain. Trust live Git and `TASK.md` over
   `NEXT.md` and chat memory.
9. If `next actor` is `human`, stop and ask for the decision.
10. If `next actor` is `verifier`, request a fresh verifier. Do not edit.
11. If `next actor` is `implementer`, hand off to exactly one `ame-implementer`
    child. Do not edit product code in the Lead session.
12. If `next actor` is `lead`, perform only Lead work: plan, state, review
    recording, or commit gate. Do not implement.
13. Do not re-plan, re-classify, or start a new task unless the human asks.

See `core/RESUMPTION.md`.
