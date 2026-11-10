---
name: ame-handoff
description: Create a complete handoff contract for a subagent or a new session. Use when delegating work, starting a child task, compacting context, or handing work to another agent. Ensures scope, ownership, acceptance criteria, evidence, and return format are explicit.
license: MIT
metadata:
  version: "0.1.0"
---

# AME Handoff

A child subagent starts with fresh context. It does not see the parent transcript.

## Context pointers

Reference artifacts by path instead of duplicating them:

- `docs/ai/PROJECT_PROFILE.md`
- `docs/ai/AME/core/`
- `GLOSSARY.md`
- `docs/ai/BACKLOG.md`
- `docs/ai/runs/<task>.md`
- ADRs
- the diff/commit

Do not paste large documents into the prompt.

## Contract

Include:

```text
Task ID:
Objective:
Workflow:
Risk:
Spec level:

Scope:
Non-goals:
Repo/branch/baseline:
Files/modules owned:
Do not touch:

Acceptance criteria:
Constraints:
Required patterns/components/endpoints:
Test commands:
Evidence required:
Approval status:

Return format:
- summary
- files changed
- commands run and results
- deviations
- blockers
- residual risks
- next action
```

## Rules

- Be explicit about non-goals.
- Be explicit about file ownership.
- State what must be reused.
- State what must not be changed.
- State whether approval is required before edits.
- State the exact test commands.
- State what “done” means.
- Do not ask the child to infer.

## Return

The child must return evidence, not just “done.”

If the child returns incomplete work, send a follow-up with the same sessionID and narrow the gap.

## Compaction

When compacting a session:

- keep decisions, constraints, and evidence;
- reference artifacts by path;
- remove narrative duplicates;
- preserve unresolved questions;
- state the next action.

## Durable task contract

Prefer `TASK.md` over a long prompt:

```text
docs/ai/runs/<task-id>/TASK.md
```

Use `templates/TASK.md`. Pass the path to the child:

```text
Implement docs/ai/runs/<task-id>/TASK.md revision 1.
Return the required evidence.
```

The child reads the task. Do not retype scope, acceptance criteria, or
verification commands.
