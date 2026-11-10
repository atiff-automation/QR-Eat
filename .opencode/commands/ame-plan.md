---
description: Plan and grill a feature or change before writing code, then produce an approvable TASK.md
agent: ame-lead
subagent: false
---

Use the planning and grilling route. This is read-only. Do not change product
code.

Plan: $ARGUMENTS

Requirements:

1. Read `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, `GLOSSARY.md`, the relevant
   docs/code, and the backlog.
2. Classify type, risk, and specification level. If this is a trivial L1,
   explain that a full plan is unnecessary and recommend `/ame-bug` or
   `/ame-feature`.
3. Load `ame-grilling`.
4. Once the task id is known, update `docs/ai/ACTIVE.md` from
   `docs/ai/AME/templates/ACTIVE.md`. It is a pointer only: task id, branch,
   updated time, and task-contract path.
5. Grill the human in rounds:
   - inspect facts yourself;
   - ask the current frontier;
   - give a recommended answer for each question;
   - wait for answers;
   - do not write code.
6. When the frontier is empty, create or update
   `docs/ai/runs/<task-id>/TASK.md` with:
   - objective, scope, non-goals;
   - decisions and assumptions;
   - a context budget: must read / read only if unclear / do not read;
   - owned files, acceptance criteria, constraints;
   - verification commands and review focus;
   - commit gate.
7. Create `NEXT.md` for L2/L3 with the current step, next action, blockers, and
   files to read first.
8. Set `TASK.md` to:
   - `Status: planning`
   - `Revision: 1` for a new task, or the next revision for a material change
   - `Approved revision:` blank for a new or materially changed task
   - `Next actor: human`
9. Ask the human to approve the exact revision. Do not implement.
10. If approved, update the task header:
    - `Status: ready_for_implementer`
    - `Approved revision: <the approved revision>`
    - `Next actor: implementer`
    - update `Updated:`
    Then update `NEXT.md` and stop.
11. If changes are requested, increment the revision, revise the task, and ask
    again.

Output:

- classification;
- settled decisions;
- open decisions;
- task path;
- approval question;
- what was not decided.

Do not start implementation. Do not silently broaden scope. Do not treat a
proposed plan as approved.
