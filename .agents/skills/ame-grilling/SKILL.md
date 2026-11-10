---
name: ame-grilling
description: Relentless planning interview for AME. Use before writing TASK.md for an L2/L3 feature, architecture change, ambiguous bug, or high-risk change. Maps the design tree, asks the current frontier in rounds, gives recommended answers, separates facts from human decisions, and stops when the plan is complete enough to approve.
license: MIT
metadata:
  version: "0.2.2"
---

# AME Grilling

Use this skill to harden a plan before it becomes a task contract. It is a
questioning protocol, not an implementation step.

Adapted from the public "grilling" idea by Matt Pocock (MIT). The wording here
is rewritten for AME.

## When to use

- L2/L3 feature or refactor.
- Architecture, API, data, auth, payment, or migration change.
- Ambiguous bug where the fix may change behaviour.
- Any request where the outcome, scope, edge cases, or acceptance criteria are
  not yet settled.

Do not use it for a trivial L1 change. One or two clarifying questions are
enough there.

## Facts and decisions

- **Facts are the Lead's job.** Inspect the repository, docs, tests, and
  existing patterns. Do not ask the human what the code already answers.
- **Decisions are the human's job.** Ask when the answer changes scope,
  behaviour, risk, data, cost, or acceptance.
- Never infer approval from silence or from a vague "looks good".

## Design tree and frontier

Treat the plan as a tree. Every decision opens later decisions.

The **frontier** is the set of decisions whose prerequisites are now settled.
Ask the whole frontier in one round. Do not ask a later question before its
prerequisite is answered.

Each answer moves the frontier outward. Recompute it and ask the next round.

## Round format

Use numbered questions. Give one recommended answer per question. Word the
question so a plain "yes" accepts the recommendation.

```text
Q1 — <short title>
<question, options, and consequence>

➡️ Recommend: <answer and why>

---

Q2 — <short title>
<question, options, and consequence>

➡️ Recommend: <answer and why>
```

Then wait. Do not answer for the human. Do not ask the next round in the same
message as the current one.

## What to grill

Cover only what applies:

- outcome, user, and success measure;
- scope and non-goals;
- main flow and alternate flows;
- empty, loading, error, partial, permission-denied, and success states;
- data and API contracts;
- compatibility and migration;
- auth, permissions, privacy, and secrets;
- failure, retry, idempotency, and recovery;
- performance and cost;
- observability and support;
- rollout, rollback, and release;
- acceptance criteria and verification;
- open assumptions and unknowns.

## Stop conditions

Stop when:

- the frontier is empty;
- no unresolved decision changes scope, behaviour, data, risk, or acceptance;
- the Lead can write a complete `TASK.md`;
- the human confirms shared understanding.

Do not grill forever. If a question is cosmetic or the Lead can answer it from
the repo, drop it.

## Output

Before writing the task, summarize:

- settled decisions;
- rejected options and why;
- assumptions;
- open decisions that still need the human;
- acceptance criteria;
- verification plan;
- material risks.

Then write or update `TASK.md`. Do not write code.

## Anti-patterns

- Asking the human for facts the repository can prove.
- Asking ten trivial questions instead of three consequential ones.
- Hiding a recommendation.
- Treating a proposed plan as approved.
- Starting implementation while the frontier is still open.
- Turning grilling into a design document that nobody will read.
