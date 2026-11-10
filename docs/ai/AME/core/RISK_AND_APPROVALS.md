# Risk and Approvals

## Purpose

Risk determines how much specification, verification, and human control a task needs.

Risk is not the number of files changed. It is assessed by:

- **Impact:** what happens if this is wrong?
- **Likelihood:** how plausible is failure?
- **Exposure:** who or what is affected?
- **Reversibility:** how hard is recovery?

## Risk classes

### R0 — Negligible

- cosmetic or internal;
- reversible;
- minimal impact;
- no sensitive data.

Examples: copy change, internal comment, local refactor with tests.

### R1 — Low

- limited impact;
- easy recovery;
- no sensitive data;
- normal feature or bug.

Examples: UI behaviour, non-critical report, minor API field.

### R2 — Significant

- material business, data, integration, or operational consequence;
- auth or permission behaviour;
- payment flow;
- migration;
- external integration;
- production configuration.

### R3 — Critical

- security, privacy, financial, or destructive consequence;
- data loss;
- payment correctness;
- production outage;
- regulatory exposure.

Examples: auth bypass, refund logic, destructive migration, secret rotation, production release with irreversible change.

## Verification depth

| Risk | Required verification |
|---|---|
| R0 | Targeted checks, independent inspection |
| R1 | Relevant tests, diff inspection, independent verification |
| R2 | Strong regression/integration tests, specialist review, explicit approval |
| R3 | R2 plus controlled testing, recovery plan, explicit human approval |

## Milestone gates

Human approval is required for:

- significant specification or scope;
- material architecture or API/data decision;
- material scope change;
- auth, payment, or permission change;
- destructive or production migration;
- secret/key handling;
- production release where required;
- any R3 action.

Routine reversible implementation within approved scope does not require constant approval.

## Approval principles

- **No approval by silence.**
- Passing tests is not permission to deploy.
- Agents cannot approve actions reserved for humans.
- Approval scope must be explicit: design ≠ build ≠ release.
- A material change after approval requires re-approval.
- Record the approval in the run log and link the evidence.

## Approval packet

Each gate should present:

```text
Task:
Risk:
What is being approved:
Scope:
Non-goals:
Evidence so far:
Open questions:
Recommended option:
Alternatives:
Consequences of approval:
Consequences of rejection:
```

For L2, design + plan + risk may be one packet. For L3, use separate gates.

## Auto-approval

- `--auto` and blanket saved approvals are forbidden for R2/R3.
- Saved approvals must be reviewed and scoped.
- A `deny` rule always overrides a saved approval.
- A permission prompt is not a milestone approval.

## Auth and payment

Auth/payment changes require:

- security review;
- reliability review for payment paths;
- explicit human approval;
- rollback or recovery plan;
- audit trail.

Do not let an agent change payment rules, refund logic, or permission models without a human decision.

## Data and migrations

- Production migrations require a human-approved plan.
- Prefer expand/contract migrations.
- Have a rollback or forward-fix plan.
- Back up before destructive change.
- Test on a copy or staging.
- Do not run production migrations from a verifier.

## Release

Release approval is separate from code approval.

Required:

- pre-flight checks;
- release plan;
- rollback plan;
- monitoring;
- human approval;
- post-deploy verification.

## Task revision and commit gate

- Approval applies to the exact `TASK.md` revision.
- A material change increments the revision and requires new approval.
- Review PASS is not commit approval.
- R2/R3 commit requires explicit human approval, the exact path list, the exact commit message, and verification evidence.
- Record the commit authorization: authorizer, date, scope, and evidence.
- R1 may use normal commit discipline.

## Exceptions

A documented exception is allowed when:

- the risk is understood;
- the reason is recorded;
- the mitigation is stated;
- an owner and expiry date exist;
- the human approves.

An undocumented exception is a defect.

## Approval record

Use `templates/RUN_LOG.md` and the `TASK.md` state header to record:

- risk class;
- gate;
- what was approved;
- who approved;
- evidence;
- conditions;
- expiry, if any.

For L2/L3, the `TASK.md` header holds revision, approved revision, status, and
next actor. `ACTIVE.md` and `NEXT.md` are navigation aids only. For R2/R3, the
commit gate is separate from task approval and review PASS.
