# Resumption and Session Continuity

## Purpose

A session can compact, crash, or end. The next session must recover the exact
task, status, evidence, and next action without guessing from chat history.

AME uses three small artifacts:

```text
docs/ai/ACTIVE.md                 # which task is active (pointer only)
docs/ai/runs/<task-id>/TASK.md    # authoritative contract and state
docs/ai/runs/<task-id>/NEXT.md    # bookmark for the next session
```

`RUN_LOG.md` and `REVIEW-*.md` hold the evidence.

This is deliberately lighter than a full workflow-state engine. Do not add a
second mutable state store.

## Source of truth

When artifacts disagree, use this order:

1. **Live Git and worktree** — what actually changed.
2. **`TASK.md` state header** — status, revision, approved revision, next actor.
3. **`RUN_LOG.md` and latest `REVIEW-*.md`** — evidence and verdict.
4. **`NEXT.md`** — bookmark; useful, not authoritative.
5. **`ACTIVE.md`** — task pointer; useful, not authoritative.
6. **Chat history or model memory** — never authoritative.

If `NEXT.md` or `ACTIVE.md` conflicts with `TASK.md` or Git, report the mismatch
and stop. Do not silently pick one.

## Status model

Use only these values in the `TASK.md` header:

```text
planning
ready_for_implementer
awaiting_review
correction_required
owner_decision_required
ready_to_commit
done
```

Routing:

| Status | Next actor | Meaning |
|---|---|---|
| `planning` | `human` or `lead` | Plan or approval is incomplete |
| `ready_for_implementer` | `implementer` | Exact revision approved |
| `awaiting_review` | `verifier` | Implementation and self-checks complete |
| `correction_required` | `implementer` | Review found a bounded defect |
| `owner_decision_required` | `human` | Scope, risk, or policy decision needed |
| `ready_to_commit` | `human` | Review passed; commit gate pending |
| `done` | none | Work closed |

Do not persist temporary activities such as `implementing`, `testing`, or
`diagnosing`. Those are session-local. Record them in `NEXT.md` if useful.

`PASS`, `PASS WITH NOTES`, and `FAIL` are review verdicts, not task states.

## When to update

- **Task start:** create `docs/ai/ACTIVE.md` from the template and point it at
  the task.
- **After planning:** create `TASK.md` and `NEXT.md`; set status `planning`.
- **After approval:** update the revision, status, next actor, and `Updated:`.
- **After implementation:** set `awaiting_review`; update `NEXT.md`.
- **After review:** set `correction_required`, `ready_to_commit`, or
  `owner_decision_required`; update `NEXT.md`.
- **Before compaction or ending:** update `NEXT.md` with the exact next action.
- **After completion:** set status `done`; clear `ACTIVE.md` to `Task: none`.

Do not update `NEXT.md` for every message. Update it when the next session would
otherwise lose a decision, a blocker, or the next step.

## Resume algorithm

The Lead runs `/ame continue` (or the explicit shortcut `/ame-resume`):

1. Read `AGENTS.md`, the project profile, and the glossary.
2. Resolve the task only through `docs/ai/ACTIVE.md`.
3. If there is no pointer, list non-`done` tasks and ask.
4. Read `TASK.md`, `RUN_LOG.md`, `NEXT.md`, and the latest review.
5. Inspect `git status`, `git diff --stat`, and recent commits.
6. Compare the recorded state with the live state.
7. Report the task, status, next actor, completed work, in-progress work,
   blockers, mismatches, and exact next action.
8. Wait for confirmation before editing.

If `next actor` is `verifier`, the Lead must request a fresh verifier and must not
edit. If it is `human`, stop. If it is `implementer`, the Lead must hand off to
exactly one `ame-implementer` child; it must not edit product code itself.

## Session break cases

### Compaction

The same session continues. Re-read `TASK.md`, `RUN_LOG.md`, `NEXT.md`, and the
latest review. Do not rely on the compacted summary.

### Session ended

Start a new session and run `/ame continue` or the explicit shortcut
`/ame-resume`.

### Crash during implementation

The live diff is the truth. Inspect it before continuing. Do not assume that a
claimed step completed. Run the relevant checks again.

### Child session still running

Do not start a duplicate. Inspect the child's status. If it is orphaned, decide
whether to continue it or resume from the parent.

### Review interrupted

Read the latest review. If no review was written, request a fresh review. Do not
invent a verdict.

## L1 and L2/L3

- **L1:** `RUN_LOG.md` only. `NEXT.md` is optional; use it only if the work is
  likely to span sessions.
- **L2/L3:** `TASK.md` + `RUN_LOG.md` + `NEXT.md`; full review only where
  required by risk.

## One writer

Only one actor may write in a worktree at a time. For a code-changing task,
that actor is the implementer child, not the Lead. Do not start a second
implementation session to "help" a running one. Separate work requires separate
worktrees and explicit ownership.

## Anti-patterns

- Guessing the active task from the newest directory or the last chat message.
- Duplicating status, revision, and next actor in `ACTIVE.md` or `NEXT.md`.
- Trusting a child's "done" claim without the diff and checks.
- Resuming by re-planning from scratch.
- Continuing after a revision or approval mismatch.
- Leaving a session without recording the next action.
