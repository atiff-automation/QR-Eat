# Pilot Checklist

## Task selection

- [ ] Real task, not a demo
- [ ] Small and reversible
- [ ] Reproducible
- [ ] Not auth/payment/migration for the first pilot
- [ ] Acceptance criteria clear
- [ ] Baseline recorded

## Before

- [ ] Risk and level assigned
- [ ] Agent set chosen
- [ ] Cost budget set
- [ ] Approval requirements known
- [ ] Rollback path known
- [ ] For L2/L3, grilling completed and the exact task revision approved
- [ ] `ACTIVE.md` points to the task and `NEXT.md` records the next action

## During

- [ ] Lead classified the task
- [ ] Delegation was justified
- [ ] Handoff contract complete
- [ ] Child context sufficient
- [ ] Approval gates respected
- [ ] No self-verification
- [ ] No parallel writes
- [ ] No secrets in logs

## Verification

- [ ] Verifier independent
- [ ] Actual diff inspected
- [ ] Tests run
- [ ] Evidence recorded
- [ ] Verdict one of PASS / PASS WITH NOTES / FAIL
- [ ] Residual risk recorded

## Resume

- [ ] `/ame-resume` recovers the task without chat history
- [ ] `TASK.md`, `NEXT.md`, and live Git agree
- [ ] No duplicate implementation was started

## Metrics

- [ ] Time to diagnose
- [ ] Time to implement
- [ ] Corrections
- [ ] Defects found by verifier
- [ ] Integration effort
- [ ] Human interventions
- [ ] Token/cost estimate
- [ ] Whether the process was proportional

## Retro

- [ ] Keep
- [ ] Simplify
- [ ] Remove
- [ ] Add one capability only
- [ ] Update run log and backlog
