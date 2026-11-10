# Definition of Done

A task is done only when the applicable items are true.

## Code

- [ ] Acceptance criteria met
- [ ] Scope respected; no unapproved changes
- [ ] Existing patterns reused
- [ ] No new dependency without approval
- [ ] Error handling is consistent
- [ ] No secrets or PII added to code or logs
- [ ] No debug instrumentation left behind
- [ ] Formatter/linter/typecheck pass

## Tests

- [ ] Relevant tests added or updated
- [ ] Tests fail without the fix / pass with it
- [ ] No tautological or implementation-coupled tests
- [ ] Contract tests updated where relevant
- [ ] Accessibility checks where relevant
- [ ] Performance budget where relevant
- [ ] Flaky tests handled, not ignored

## UI/UX

- [ ] Empty, loading, error, success, partial, permission-denied states
- [ ] Copy is clear and actionable
- [ ] Keyboard and focus work
- [ ] Labels, roles, contrast
- [ ] Responsive at agreed breakpoints
- [ ] No layout shift
- [ ] Tokens/components reused

## API/Data

- [ ] API matches contract
- [ ] Authz on every endpoint
- [ ] Validation at the boundary
- [ ] Money/date/ID/enum conventions
- [ ] Idempotency where required
- [ ] Migration safe and reversible/forward-fixable
- [ ] Data retention/deletion considered

## Security

- [ ] Authn/authz verified
- [ ] Input/injection checks
- [ ] Secrets handled safely
- [ ] Rate limits/abuse controls where relevant
- [ ] Payment controls where relevant
- [ ] Dependency risk reviewed

## Operations

- [ ] Logs/metrics/errors observable
- [ ] Alerts where required
- [ ] Backup/rollback plan
- [ ] Smoke test
- [ ] Release approval

## Review and commit

- [ ] If L2/L3, `TASK.md` revision matches approved revision
- [ ] Review verdict is PASS or PASS WITH NOTES
- [ ] Full `REVIEW-*.md` exists when required
- [ ] `TASK.md` status is `ready_to_commit` for R2/R3
- [ ] `NEXT.md` records the commit gate
- [ ] Commit authorization recorded for R2/R3
- [ ] Commit gate approved
- [ ] No unrelated changes

## Documentation

- [ ] Run log updated
- [ ] ADR for material decisions
- [ ] Glossary updated
- [ ] API docs updated
- [ ] Known limitations recorded
