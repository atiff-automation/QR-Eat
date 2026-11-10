# Production Readiness Checklist

## Build and release

- [ ] Build reproducible
- [ ] Tests pass in CI
- [ ] Lint/typecheck pass
- [ ] Migrations tested
- [ ] Environment variables documented
- [ ] Secrets stored securely
- [ ] Rollback plan
- [ ] Smoke test
- [ ] Release approval

## Observability

- [ ] Structured logs
- [ ] Correlation IDs
- [ ] Error tracking
- [ ] Metrics/dashboard
- [ ] Alerts for availability, errors, latency, payment failures
- [ ] SLOs defined
- [ ] Log retention and redaction

## Data

- [ ] Backup enabled
- [ ] Restore tested
- [ ] Retention/deletion defined
- [ ] PII mapped
- [ ] Test data anonymized
- [ ] Migration rollback/forward-fix
- [ ] Tenant isolation if applicable

## Security

- [ ] Authn/authz checked
- [ ] Input validation
- [ ] Secrets not in code/logs
- [ ] Dependency scan
- [ ] Security headers
- [ ] Rate limits
- [ ] Admin access reviewed
- [ ] Audit log for sensitive actions

## Payments

- [ ] PCI scope minimized
- [ ] Tokenization
- [ ] Webhook signature
- [ ] Idempotency
- [ ] Reconciliation
- [ ] Refund/chargeback
- [ ] 3DS/SCA where required
- [ ] Fraud/rate limits

## UX and accessibility

- [ ] All UI states
- [ ] Keyboard/focus
- [ ] Labels/roles/contrast
- [ ] Responsive
- [ ] Performance budget
- [ ] Error messages actionable
- [ ] Accessible authentication

## Operations

- [ ] Incident runbook
- [ ] Severity levels
- [ ] On-call/escalation
- [ ] Status communication
- [ ] Postmortem process
- [ ] Dependency upgrade policy
- [ ] Cost monitoring

## Documentation

- [ ] README/runbook current
- [ ] API docs current
- [ ] ADRs current
- [ ] Glossary current
- [ ] Run logs current
