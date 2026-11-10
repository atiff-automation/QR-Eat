# Roles and Contracts

## Role model

Roles are responsibilities, not headcount. One agent may hold one role. A small task may use only the Lead and Verifier.

## Core roles

### Lead

Mandatory for every AME task.

Responsibilities:

- understand the requested outcome;
- classify type, complexity, risk, and specification level;
- read project instructions and relevant context;
- select the workflow;
- for L2/L3, grill the human in frontier rounds before writing the task;
- decide whether specialist delegation is useful;
- delegate bounded work;
- consolidate and challenge findings;
- obtain required approvals;
- own implementation coordination;
- own all integration;
- ensure independent verification;
- report evidence, tests, and residual risk.

The Lead may implement small tasks itself, but must not verify its own code changes.

### Investigator

Use for unclear bugs, unfamiliar code, production incidents, and risk discovery.

Responsibilities:

- reproduce where possible;
- trace execution, data flow, and state;
- examine logs, stack traces, database state, and recent changes;
- identify likely root cause;
- separate confirmed cause from hypothesis;
- document evidence and uncertainty;
- identify neighbouring behaviour.

The Investigator does not implement fixes.

### Architect

Use for cross-module work, architecture changes, API/data contracts, and material trade-offs.

Responsibilities:

- understand the existing architecture;
- identify module boundaries and ownership;
- evaluate alternatives;
- consider API, data, security, performance, and operations;
- produce a plan with trade-offs;
- define the API/data contract;
- record decisions as ADRs when material.

The Architect does not own implementation.

### Implementer

Use for approved, bounded work.

Responsibilities:

- implement within scope;
- follow the approved architecture;
- respect file ownership;
- write or update tests;
- report blockers and deviations;
- avoid unapproved scope expansion;
- reuse existing patterns before creating new ones.

The Implementer does not approve its own work and does not spawn subagents.

### Independent Verifier

Required for every code-changing task.

Responsibilities:

- receive the original task and acceptance criteria;
- inspect the actual integrated diff;
- verify against the specification;
- check standards, consistency, and regressions;
- run permitted tests;
- inspect UX/UI states, accessibility, API contracts, and security where relevant;
- report findings by severity;
- return one verdict: PASS, PASS WITH NOTES, or FAIL.

The Verifier is read-only during initial verification. It does not fix the code it reviews.

## Conditional roles

### Security & Privacy Specialist

Use for auth, sessions, permissions, payments, PII, secrets, uploads, admin panels, and sensitive integrations.

Checks:

- authentication and authorization;
- session and token handling;
- input validation, injection, SSRF, IDOR;
- secrets and key handling;
- data exposure and logging;
- privacy and retention;
- payment scope and provider integration.

Read-only. Reports findings. Does not approve risk.

### Data & Migration Specialist

Use for schema changes, backfills, indexes, data integrity, and production migrations.

Checks:

- migration safety and reversibility;
- lock and downtime risk;
- backfill correctness;
- constraints and indexes;
- rollback plan;
- data retention and deletion.

Read-only. May use a test database or dry run. Never runs production migrations.

### Reliability & Payments Specialist

Use for webhooks, retries, idempotency, race conditions, queues, external providers, and payment flows.

Checks:

- idempotency;
- retry and backoff;
- duplicate processing;
- webhook signatures and replay;
- failure modes;
- reconciliation;
- observability and alerting.

Read-only. Does not change payment rules.

### Product/UX Specialist

Use for user-facing L2/L3 work.

Responsibilities:

- clarify user, problem, and success criteria;
- draft user flows;
- define UI states and edge cases;
- propose copy;
- identify accessibility and responsive requirements;
- research patterns when needed.

The human owns product and UX decisions. The specialist facilitates and drafts.

### Frontend Specialist

Use when frontend work is large enough to justify a separate role.

Responsibilities:

- component boundaries and reuse;
- state and data fetching;
- forms and validation;
- error, loading, empty, and permission states;
- accessibility;
- performance budgets;
- frontend tests.

### Backend Specialist

Use when backend work is large enough to justify a separate role.

Responsibilities:

- domain boundaries;
- API contract;
- validation and authorization;
- transactions and idempotency;
- data access and migrations;
- error model;
- observability.

## Task and review artifacts

For L2/L3 and R2/R3, the Lead creates:

- `docs/ai/ACTIVE.md` — pointer to the active task;
- `docs/ai/runs/<task-id>/TASK.md` — exact contract and authoritative state;
- `docs/ai/runs/<task-id>/RUN_LOG.md` — evidence;
- `docs/ai/runs/<task-id>/NEXT.md` — resume bookmark.

The Implementer receives the `TASK.md` path, not a retyped contract. `TASK.md`
includes a context budget: must read / read only if unclear / do not read.

The Verifier returns the structured review report; the Lead writes
`REVIEW-<n>.md` and updates the `TASK.md` state header, because the Verifier is
read-only.

`ACTIVE.md` and `NEXT.md` are navigation aids. If they conflict with `TASK.md`
or live Git, the task and Git win. See `core/RESUMPTION.md`.

## Authority matrix

| Decision | Owner | Challengers |
|---|---|---|
| Product outcome | Human | Product/UX, Architect |
| UX flow and copy | Human approves; Product/UX drafts | Architect, Verifier |
| Architecture and boundaries | Architect | Lead, Security, Data |
| API/data contract | Architect | Backend, Frontend, Security, Data |
| Implementation details | Implementer | Architect, Verifier |
| Verification verdict | Verifier | Specialists provide findings |
| Risk acceptance | Human | Security, Data, Reliability |
| Release | Human | Lead, Reliability |
| Production migration | Human | Data, Security |

## Handoff contract

Every delegated task includes:

```text
Task ID:
Objective:
Workflow:
Risk:
Specification level:

Scope:
Non-goals:
Repository / branch / baseline commit:
Files or modules owned:
Do not touch:

Acceptance criteria:
Constraints:
Required patterns / components / endpoints:
Test and verification commands:
Evidence required:
Approval status:

Return format:
- summary
- files changed
- commands run and results
- deviations
- blockers
- residual risks
- recommended next action
```

A child subagent starts with fresh context. The handoff must contain everything it needs. Do not assume it can see the parent conversation.

## Return contract

Every specialist returns:

- outcome;
- what was inspected or changed;
- evidence: commands, outputs, diffs, screenshots where relevant;
- uncertainty and assumptions;
- blockers;
- residual risk;
- recommended next action.

“Done” without evidence is not a valid return.

## Verification contract

The Verifier receives:

- original task;
- acceptance criteria;
- risk level;
- actual diff or integrated branch;
- relevant project standards;
- test commands;
- specialist findings.

The Verifier returns:

- verdict;
- findings by severity;
- evidence;
- what was not verified;
- residual risk.

## Escalation

Escalate to the human when:

- scope changes materially;
- architecture or API changes materially;
- risk increases;
- a destructive or production action is required;
- a security or privacy concern is found;
- specialists disagree;
- verification cannot obtain evidence;
- cost or time exceeds the approved budget.

## Role anti-patterns

- Lead implements and self-verifies.
- Investigator starts fixing before diagnosis.
- Architect writes code.
- Implementer expands scope silently.
- Verifier edits the code it reviews.
- Security specialist approves risk.
- Data specialist runs a production migration.
- Product/UX specialist makes business decisions.
- Every role runs on every task.
