---
description: Remediate findings from an AME review report without retyping the findings
agent: ame-lead
subagent: false
---

Use the BUG workflow for remediation.

Source: $ARGUMENTS

Requirements:

1. Read the referenced review report and its `TASK.md`.
2. Confirm the verdict is `FAIL` or `PASS WITH NOTES`.
3. Update the `TASK.md` state header: `correction_required`, next actor `implementer`.
4. Ask which severity band to fix: critical, high, or all.
5. Fix only the approved findings. Do not broaden scope.
6. Do not print credentials or PII.
7. Do not rewrite Git history, rotate credentials, merge, or deploy.
8. Respect the bounded repair limit: 3 correction cycles.
9. Re-run the documented checks.
10. Request a fresh independent review and record `REVIEW-02.md` when required.
11. Report evidence, residual risk, and the commit gate.

If a finding requires a scope, policy, auth, payment, schema, or risk decision, stop and ask the human.
