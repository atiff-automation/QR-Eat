# AME Methodology

## Purpose

Adaptive Multi-Agent Engineering (AME) is a practical method for AI-assisted software engineering. It keeps one accountable Lead, delegates specialist work when useful, verifies independently, and scales process with risk.

AME is designed for real projects, not agent demonstrations.

## Core principle

> One accountable lead, specialised execution, independent verification, and human control at meaningful milestones.

AME is:

- multi-agent capable by default;
- adaptive in how many agents it uses;
- risk-aware;
- evidence-driven;
- cost-conscious;
- tool-independent;
- compatible with ordinary single-agent work;
- focused on maintainable software, not agent activity.

A simple task should remain simple. A complex task should be able to use specialists.

## What AME is not

- Not a guarantee of good code.
- Not a replacement for tests, CI, security review, or human judgment.
- Not a fixed six-agent pipeline.
- Not a graph orchestration framework.
- Not a reason to delegate every task.
- Not a claim that more agents are better.

## Lifecycle

```text
INTAKE
  → CLASSIFY
  → CONTEXT
  → SPECIFY
  → CHALLENGE
  → PLAN
  → APPROVAL
  → EXECUTE
  → VERIFY
  → INTEGRATE
  → RELEASE
  → OBSERVE
  → LEARN
  → DOCUMENT
  → DONE
```

Not every task runs every node.

- **INTAKE:** where the task came from, priority, dependencies, WIP limit.
- **CLASSIFY:** type, complexity, risk, specification level.
- **CONTEXT:** read project instructions, architecture, glossary, relevant code.
- **SPECIFY:** outcome, scope, non-goals, acceptance criteria.
- **CHALLENGE:** question gaps, edge cases, alternatives, hidden risk. For L2/L3,
  grill the human in frontier rounds before writing the task.
- **PLAN:** approach, boundaries, contracts, test strategy.
- **APPROVAL:** human decision at the required milestone. A proposed plan is not
  approval.
- **EXECUTE:** bounded implementation, frontend/backend/data as needed.
- **VERIFY:** independent evidence and verdict.
- **INTEGRATE:** Lead combines and owns the result.
- **RELEASE:** deploy or publish with the required gate.
- **OBSERVE:** logs, metrics, errors, user feedback.
- **LEARN:** retro, incident review, architecture audit.
- **DOCUMENT:** update ADRs, glossary, run log, docs.
- **DONE:** only when the Definition of Done is met.

## Specification levels

### L1 — Lightweight

For small, reversible tasks.

- task and expected behaviour;
- acceptance criteria;
- constraints;
- verification method.

### L2 — Feature

For normal features.

- requirements and user flow;
- edge cases;
- technical approach;
- data/API impact;
- decomposition;
- risks;
- tests and acceptance criteria.

### L3 — Full

For complex or high-risk work.

- scope and non-goals;
- detailed requirements;
- user journeys;
- architecture;
- data model;
- API contracts;
- security and privacy;
- operations;
- roadmap;
- risk register;
- test and deployment strategy.

Specification level is driven by complexity and risk, not documentation quantity.

## Adaptive routing

| Task | Typical agents |
|---|---|
| Tiny UI change | Lead + Verifier |
| Small bug | Lead + Investigator (if needed) + Implementer + Verifier |
| Normal feature | Lead + Implementer + Verifier; Architect if cross-module |
| Complex feature | Lead + Investigator + Architect + Implementers + Verifier |
| Production bug | Lead + Investigator + Architect + Implementer + Verifier |
| Architecture change | Lead + Architect + human + Implementer + Verifier |
| Security-sensitive | Lead + Security + Implementer + Verifier |
| Payment change | Lead + Security + Reliability + Implementer + Verifier |
| Data migration | Lead + Data + Implementer + Verifier |

Routing is a guideline, not a rigid rule. The Lead decides.

## When not to delegate

Do not delegate when:

- the task is a one-file change;
- the investigation is already conclusive;
- coordination cost exceeds the work;
- the task is urgent and sequential execution is safer;
- the specialist would only repeat the Lead’s work;
- the task is a trivial copy or label change.

## Integration ownership

The Lead owns:

- the final diff;
- conflict resolution;
- consistency with architecture;
- final verification request;
- evidence and residual risk;
- release recommendation.

No specialist merges its own work.

## Verification

Every code-changing task receives independent verification. Verification depth adapts to risk:

| Risk | Verification |
|---|---|
| R0 | Targeted checks and independent inspection |
| R1 | Relevant tests, diff inspection, independent verification |
| R2 | Strong regression/integration testing and specialist review |
| R3 | R2 plus controlled testing, explicit human approval, recovery plan |

The verifier is separate from the implementer. Passing tests is not permission to deploy.

## Definition of Done

A task is done only when:

- acceptance criteria are met;
- tests and evidence exist;
- independent verification passes;
- UI/UX, accessibility, API, data, and security checks pass where relevant;
- documentation and run log are updated;
- residual risks are recorded;
- release approval is obtained where required.

See `templates/DEFINITION_OF_DONE.md`.

## Adoption levels

### AME Lite

- Lead + Verifier.
- Five skills.
- Sequential work.
- One-page `AGENTS.md`, project profile, glossary.
- Best for solo developers and small SaaS.

### AME Standard

- Core five roles plus conditional specialists.
- UI/UX gates.
- Contract-first frontend/backend.
- Consistency checks.
- Best for a running product with auth/payment.

### AME Regulated

- Security, privacy, data, and reliability specialists.
- Full L3 specs, audit trail, controlled release, STE-lite procedures.
- Best for high-risk or regulated work.

Do not adopt Regulated process for a small task.

## Task artifacts and tiering

Keep the process proportional:

| Tier | Artifacts | Review | Commit |
|---|---|---|---|
| L1 / R0–R1 | `RUN_LOG.md` only | Verifier verdict in run log | Normal commit |
| L2 / R1–R2 | `TASK.md` + `RUN_LOG.md` + `NEXT.md` | Full report only on FAIL/notes | Light gate |
| L3 / R2–R3 | `TASK.md` + `RUN_LOG.md` + `NEXT.md` + `REVIEW-*.md` | Fresh verifier | Explicit human commit gate |

Task artifacts live under `docs/ai/runs/<task-id>/` for L2/L3. `ACTIVE.md` is a
pointer to the current task. `NEXT.md` is a resume bookmark, not a second state
store. Do not create a task directory for a typo.

For L2/L3, `TASK.md` includes a **context budget**:

```text
Must read:
Read only if unclear:
Do not read by default:
```

The agent should read the task and named sources, not scan the whole repository.
Broaden context only when evidence shows it is needed.

See `REVIEW_AND_REMEDIATION.md`, `RESUMPTION.md`, and `ORCHESTRATION.md`.

## Success criteria

AME is successful when it improves:

1. engineering correctness;
2. debugging reliability;
3. independent verification;
4. context management;
5. controlled parallelism;
6. ownership clarity;
7. integration quality;
8. human control;
9. cost efficiency;
10. portability.

Do not claim improvement before pilot measurement.

## Non-goals

- Replacing engineering judgment.
- Automating product strategy.
- Guaranteeing architecture quality.
- Eliminating the need for CI, observability, security, or human review.
- Making every task multi-agent.
