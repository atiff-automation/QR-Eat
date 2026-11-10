# Workflows

Graph-Lite is a process definition, not a runtime dependency. Each workflow is a route through the same spine.

## Common spine

```text
INTAKE → CLASSIFY → CONTEXT → SPECIFY → CHALLENGE → PLAN
→ APPROVAL → EXECUTE → VERIFY → INTEGRATE → RELEASE
→ OBSERVE → LEARN → DOCUMENT → DONE
```

Not every task needs every node.

## Workflow families

- FEATURE
- BUG
- REVIEW
- AUDIT
- REFACTOR
- ARCHITECTURE
- DEPLOY / INCIDENT

---

# FEATURE_WORKFLOW

Use for new user-facing or system capability.

## Steps

1. **Intake:** source, priority, dependencies, WIP limit.
2. **Classify:** L1/L2/L3, R0–R3.
3. **Context:** existing architecture, patterns, components, API, data, tests.
4. **Specify:**
   - outcome and non-goals;
   - user flow if user-facing;
   - acceptance criteria;
   - data/API impact;
   - risks.
5. **UX gate (L2/L3 user-facing):**
   - user flow;
   - UI states;
   - copy;
   - component reuse;
   - accessibility;
   - responsive behaviour.
6. **Challenge:** for L2/L3, load `ame-grilling` and resolve the planning
   frontier in rounds. Cover edge cases, alternatives, hidden coupling, security,
   data, and cost.
7. **Plan:**
   - module boundaries;
   - API/data contract;
   - frontend/backend ownership;
   - test strategy;
   - migration/rollback if needed.
8. **Approval:** design + plan + risk at the appropriate level. A proposed plan
   is not approval. Record the approved revision in `TASK.md`.
9. **Execute:** bounded implementation.
10. **Verify:** spec, standards, consistency, UX, accessibility, contract, security, tests.
11. **Integrate:** Lead owns the final diff.
12. **Release:** only with the required approval.
13. **Observe/Learn:** metrics, errors, feedback, retro.
14. **Document:** ADR, glossary, run log, API docs.

## Planning-only route

Use `/ame-plan` when the human wants discussion and approval before any code.
It grills, writes `TASK.md`, sets `planning / next actor = human`, and stops.
After approval, the same session or a new session can implement the approved
revision without re-planning.

## Outputs

- accepted feature;
- tests and evidence;
- updated docs;
- residual risk;
- release recommendation.

## Stop conditions

- acceptance criteria unclear;
- API/data contract unresolved;
- UX states undefined;
- security or privacy risk unowned;
- migration rollback unknown;
- verification evidence unavailable.

---

# BUG_WORKFLOW

Use for defects and unexpected behaviour.

## Steps

1. **Classify:** severity, risk, scope.
2. **Define expected vs actual**, including reproduction.
3. **Investigate:**
   - build a red-capable feedback loop;
   - reproduce;
   - minimise;
   - form 3–5 falsifiable hypotheses;
   - instrument one variable at a time;
   - identify root cause or state uncertainty.
4. **Challenge:** is this the real cause? Is it a symptom? Is the design wrong?
   If the fix changes behaviour or scope, use `ame-grilling`.
5. **Approve:** required for R2/R3 or business-rule changes.
6. **Fix:** smallest correct change.
7. **Regression test:** fail before, pass after, at the right seam.
8. **Verify:** original symptom, regression, neighbouring behaviour.
9. **Integrate and release** with the required gate.
10. **Document:** root cause, fix, residual risk.

## Distinguish

- root-cause correction;
- architectural correction;
- temporary mitigation;
- symptom suppression;
- unverified workaround.

A temporary mitigation must be labelled, owned, and assigned a follow-up.

## Stop conditions

- cannot reproduce and no captured evidence;
- root cause unconfirmed for a high-risk fix;
- no correct test seam;
- fix requires unapproved architecture change.

---

# REVIEW_WORKFLOW

Read-only.

## Steps

1. Pin the diff base.
2. Identify the specification source.
3. Identify standards sources.
4. Review on two axes:
   - **Spec:** does it implement what was asked?
   - **Standards:** does it follow documented standards and quality heuristics?
5. Add consistency, UX/UI, accessibility, API, security, and data checks where relevant.
6. Report findings by severity.
7. Do not edit.

## Output

- findings;
- evidence;
- verdict;
- recommended fixes, not fixes.

If fixes are approved, start a separate BUG or FEATURE workflow.

---

# AUDIT_WORKFLOW

Read-only, broader than a diff review.

## Use for

- architecture review;
- security review;
- dependency review;
- consistency drift;
- performance investigation;
- pre-production readiness.

## Steps

1. Define scope and questions.
2. Gather evidence.
3. Identify risks and candidates.
4. Rank by severity and expected value.
5. Recommend actions.
6. Do not change code.

## Output

- audit report;
- risk register updates;
- candidate refactors;
- follow-up backlog items.

---

# REFACTOR_WORKFLOW

Behaviour-preserving change.

## Steps

1. Establish baseline tests and behaviour.
2. Define the structural goal and non-goals.
3. Plan the smallest safe sequence.
4. Refactor in small steps.
5. Run tests after each step.
6. Verify behaviour unchanged.
7. Review the diff for scope creep.

## Rules

- Do not mix refactor with feature or bug fix.
- Do not change public behaviour without explicit approval.
- If a test must change, explain why it is not a behaviour change.

---

# ARCHITECTURE_WORKFLOW

Use for cross-module design, data model changes, API redesign, or infrastructure shifts.

## Steps

1. Understand current architecture and constraints.
2. Define the problem and non-goals.
3. Generate at least two options, including “do nothing” or “smallest change.”
4. Evaluate trade-offs: complexity, cost, risk, migration, operations.
5. Recommend one.
6. Human approval.
7. Implement behind a contract or flag.
8. Verify integration and rollback.
9. Record an ADR.

## Rules

- Architecture decisions are human-approved.
- Prefer the simplest option that solves the confirmed problem.
- Do not add infrastructure without evidence.
- Do not let implementation invent architecture.

---

# DEPLOY_WORKFLOW

Deployment is not a code change workflow.

## Steps

1. Pre-flight: build, tests, migrations, config, secrets, backups.
2. Release plan: feature flag, canary, or staged rollout.
3. Human approval.
4. Deploy.
5. Smoke tests.
6. Observe errors, latency, payment success, key metrics.
7. Rollback if thresholds are breached.
8. Record release and outcome.

## Rules

- Passing tests is not permission to deploy.
- Production migrations require a rollback or forward-fix plan.
- Never deploy unreviewed changes during an incident without labelling the risk.

---

# INCIDENT_WORKFLOW

Use when production is degraded.

## Steps

1. Stabilise first: stop the bleeding, preserve evidence.
2. Assign an incident owner.
3. Mitigate, even if temporary.
4. Communicate status.
5. Verify recovery.
6. Investigate root cause after stabilisation.
7. Label the mitigation and assign follow-up.
8. Postmortem: timeline, cause, impact, corrective actions.
9. Update backlog, tests, monitors, and docs.

## Rules

- Do not let a temporary mitigation become permanent silently.
- Do not skip the postmortem because the fix worked.
- Blameless analysis, concrete actions.

---

# UI/UX sub-flow

For user-facing work, insert between SPECIFY and PLAN.

```text
Product intent
→ UX flow
→ UI states
→ design review
→ API/data contract
→ frontend/backend build
→ UX/UI/a11y verification
→ human acceptance
```

## L1

- Reuse existing pattern.
- Short note and screenshot.
- Verify copy, accessibility, layout.

## L2

- User flow.
- State matrix.
- Low-fidelity wireframe.
- Component reuse.
- Copy.
- Accessibility and responsive rules.
- Design approval.

## L3

- Discovery.
- Information architecture.
- Prototype.
- Small usability test.
- Design-system impact.
- Accessibility plan.
- Explicit approval.

## UI state matrix

Every screen defines:

- empty;
- loading;
- error;
- success;
- partial;
- permission denied;
- mobile.

---

## Review → fix loop

For L2/L3 and R2/R3:

1. The Lead writes `TASK.md` (with its state header), `RUN_LOG.md`, and `NEXT.md`.
2. The Implementer works from `TASK.md`.
3. The Verifier returns a structured report.
4. The Lead writes `REVIEW-01.md` and updates `NEXT.md`.
5. If FAIL, set `correction_required`; the human runs `/ame-fix <review-path>`.
6. The Implementer fixes only approved findings; maximum 3 correction cycles.
7. A fresh review writes `REVIEW-02.md`.
8. PASS → `ready_to_commit` for R2/R3, or normal commit for L1/L2.
9. R2/R3 commit requires explicit human approval, exact path list, and recorded
   commit authorization.

Do not move findings by chat. Use files. After a break, run `/ame-resume`.

## Commit gate

Committing is separate from task approval and review PASS.

For R2/R3:

- exact path list;
- exact commit message;
- verification evidence;
- explicit human approval;
- no unrelated files.

# Workflow selection rules

- If the cause is unknown, use BUG or AUDIT before FEATURE.
- If the design is wrong, use FEATURE or ARCHITECTURE, not BUG.
- If no behaviour changes, use REFACTOR.
- If no code changes, use REVIEW or AUDIT.
- If production is degraded, use INCIDENT before root-cause work.
- If the task is trivial, use the smallest workflow that still verifies.
