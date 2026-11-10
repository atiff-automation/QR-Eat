# Review and Remediation

## Purpose

Use durable artifacts only at the boundaries where chat is not enough. Do not
turn every task into paperwork.

```text
L1: implement → verify → run log
L2: grill → TASK.md → implement → verify
      PASS → verdict in RUN_LOG
      FAIL → REVIEW-01.md → /ame-fix → re-review
L3: grill → TASK.md → approve → implement → verify
      → REVIEW-01.md → /ame-fix if FAIL → REVIEW-02.md
      → commit gate
```

## When to use what

| Tier | `TASK.md` | `RUN_LOG.md` | `NEXT.md` | Full `REVIEW` | Commit gate |
|---|---|---|---|---|---|
| L1 / R0–R1 | No | Yes, short | Optional | No; verdict in run log | Normal |
| L2 / R1–R2 | Yes, short | Yes | Yes | Only on FAIL or notes | Light |
| L3 / R2–R3 | Yes | Yes | Yes | Always | Explicit human |

## Task directory

L2/L3:

```text
docs/ai/ACTIVE.md              # pointer to the active task
docs/ai/runs/<task-id>/
├── TASK.md                    # authoritative contract and state
├── RUN_LOG.md                 # evidence and approvals
├── NEXT.md                    # resume bookmark
├── REVIEW-01.md               # only when required
└── REVIEW-02.md               # after correction
```

L1:

```text
docs/ai/runs/<task-id>.md
```

`TASK.md` is authoritative for state. `ACTIVE.md` and `NEXT.md` never override
it. See `core/RESUMPTION.md`.

## State model

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

| Status | Next actor |
|---|---|
| `planning` | `lead` or `human` |
| `ready_for_implementer` | `implementer` |
| `awaiting_review` | `verifier` |
| `correction_required` | `implementer` |
| `owner_decision_required` | `human` |
| `ready_to_commit` | `human` |
| `done` | none |

A review verdict (`PASS`, `PASS WITH NOTES`, `FAIL`) is not a task state.

## How the Lead asks the Implementer

Pass the path, not a long prompt:

```text
Implement docs/ai/runs/<task-id>/TASK.md revision 1.
Return the required evidence.
```

`TASK.md` contains objective, decisions, context budget, scope, non-goals,
ownership, acceptance criteria, constraints, required patterns, verification
commands, review focus, and the commit gate.

## How the Lead asks the Verifier

```text
Verify docs/ai/runs/<task-id>/TASK.md revision 1.
Diff base: <commit>.
Inspect the actual diff, run the listed checks, and return the report structure.
```

The Verifier is read-only. It returns the report. The Lead writes `REVIEW-*.md`
only when required and updates the `TASK.md` header.

## Review report rules

Write a full `REVIEW-*.md` when:

- L3/R2/R3, always;
- L2 review FAILs;
- L2 review has notes.

For a clean L1/L2 PASS, record in `RUN_LOG.md`:

```text
Verdict: PASS
Reviewer: ame-verifier
Evidence: <commands/output>
```

## Bounded repair

Maximum 3 correction cycles. A cycle is an implementation correction, not
diagnosis.

Escalate on:

- scope or authority change;
- policy/business decision;
- new dependency/service/schema;
- auth/security/payment boundary;
- exhausted cycle limit;
- task cannot be completed safely.

## `/ame-fix`

```text
/ame-fix docs/ai/runs/<task-id>/REVIEW-01.md
```

- read the report, `TASK.md`, and `NEXT.md`;
- fix only approved findings;
- no credential printing;
- no history rewrite, rotation, merge, or deploy;
- re-run checks;
- request fresh review;
- record `REVIEW-02.md` when required.

## Session resume

Before compacting or ending a session, update `NEXT.md` with:

- current step;
- completed work;
- in-progress work;
- exact next action;
- blockers and open decisions;
- files to read first;
- what not to do.

A new session runs `/ame continue` (or `/ame-resume`). It reads `ACTIVE.md`,
`TASK.md`, `RUN_LOG.md`, `NEXT.md`, the latest review, and live Git. If they
disagree, it stops and reports the mismatch.

## Commit gate

For R2/R3:

- review PASS;
- exact path list;
- exact commit message;
- verification evidence;
- explicit human approval;
- recorded commit authorization;
- no unrelated files.

Task approval and review PASS are not commit approval. Record:

```text
Authorized by:
Date:
Scope:
Evidence:
```

For R1, use normal commit discipline.

## Role boundaries

- Lead: plans, grills, delegates, integrates, writes review when required,
  requests approval.
- Implementer: changes only owned files.
- Verifier: read-only; returns the report; does not write it.
- Human: approves scope, risk, commit, release.
