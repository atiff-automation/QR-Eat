# Agent Security Checklist

## Trust boundary

- [ ] Untrusted inputs identified
- [ ] Prompt-injection risk considered
- [ ] Agent permissions minimized
- [ ] External directories restricted
- [ ] Shell allowlist where practical
- [ ] Network access considered
- [ ] MCP servers audited
- [ ] Third-party skills audited

## Secrets

- [ ] No secrets in prompts
- [ ] No secrets in logs
- [ ] No secrets in screenshots
- [ ] `.env` denied for verifier
- [ ] Deploy credentials separated
- [ ] Rotation plan

## Actions

- [ ] No auto-approve for R2/R3
- [ ] Human approval for destructive actions
- [ ] Human approval for production
- [ ] No `curl | sh` from untrusted source
- [ ] Package installs reviewed
- [ ] Lockfile changes reviewed

## Evidence

- [ ] Logs redacted
- [ ] PII removed
- [ ] Run logs safe to commit
- [ ] Screenshots safe
- [ ] Artifacts retained only as needed

## Supply chain

- [ ] Dependencies pinned
- [ ] Licenses reviewed
- [ ] Package ownership checked
- [ ] AI-suggested packages verified
- [ ] MCP/skill provenance checked

## Response

- [ ] Incident path
- [ ] Credential rotation
- [ ] User/regulator notification
- [ ] Postmortem
- [ ] Follow-up actions
