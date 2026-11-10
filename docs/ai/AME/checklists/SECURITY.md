# Security Checklist

Use OWASP ASVS as the reference for depth.

## Authentication

- [ ] Password hashing is current and correct
- [ ] Session/token expiry and rotation
- [ ] Secure cookie flags
- [ ] Account enumeration considered
- [ ] Password reset safe
- [ ] MFA where appropriate
- [ ] Rate limiting/login throttling

## Authorization

- [ ] Every endpoint checks authorization
- [ ] Tenant isolation
- [ ] IDOR checks
- [ ] Admin routes protected
- [ ] Object ownership checks
- [ ] Role changes audited

## Input/output

- [ ] Validation at boundary
- [ ] SQL/NoSQL injection
- [ ] XSS
- [ ] SSRF
- [ ] Path traversal
- [ ] File upload safety
- [ ] Deserialization safety
- [ ] Output encoding

## Session and browser

- [ ] CSRF protection
- [ ] Security headers
- [ ] CORS restricted
- [ ] Clickjacking protection
- [ ] Secure redirects

## Secrets

- [ ] No secrets in code
- [ ] No secrets in logs
- [ ] Secret rotation
- [ ] Least-privilege credentials
- [ ] Deploy credentials separated

## Dependencies

- [ ] Lockfile committed
- [ ] Vulnerability scan
- [ ] License review
- [ ] Package source reviewed
- [ ] No AI-hallucinated packages

## Logging and privacy

- [ ] No PII in logs
- [ ] Audit log for sensitive actions
- [ ] Retention defined
- [ ] Redaction tested
- [ ] Breach notification plan

## Agent-specific

- [ ] MCP servers audited
- [ ] Third-party skills audited
- [ ] Prompt-injection considered
- [ ] No auto-approve for R2/R3
- [ ] External directory restricted
- [ ] Shell allowlist where practical
