# Remediation Checklist

## Source

- [ ] Review report exists
- [ ] Verdict is FAIL or PASS WITH NOTES
- [ ] Task revision and diff base are known
- [ ] `TASK.md` status is `correction_required`
- [ ] `NEXT.md` records the current step and next action
- [ ] Severity band selected
- [ ] Human approved the remediation scope

## Scope

- [ ] Fix only findings in the selected band
- [ ] No product behavior changes outside findings
- [ ] No unrelated refactor
- [ ] No new dependency/schema/auth/payment change without approval
- [ ] No credentials printed
- [ ] No history rewrite, rotation, merge, or deploy

## Repair

- [ ] Bounded to 3 correction cycles
- [ ] Each cycle records the cause and fix
- [ ] Escalate on scope/risk/authority change
- [ ] Re-run documented checks
- [ ] Update `RUN_LOG.md`

## Re-review

- [ ] Fresh verifier context
- [ ] Reads `TASK.md`, not the implementer summary
- [ ] Inspects the actual diff
- [ ] Writes `REVIEW-02.md` through the Lead
- [ ] Verdict is PASS / PASS WITH NOTES / FAIL

## Commit gate

- [ ] Review PASS
- [ ] `TASK.md` status is `ready_to_commit`
- [ ] `NEXT.md` records the commit gate
- [ ] Human approves exact commit
- [ ] Commit authorization recorded (authorizer, date, scope, evidence)
- [ ] Exact path list published
- [ ] Exact commit message published
- [ ] No unrelated changes
- [ ] Residual risk recorded
