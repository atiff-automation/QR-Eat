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
3. Read `NEXT.md` to recover the exact current step and blockers. Follow the
   context budget in `TASK.md`; do not scan unrelated docs or modules.
4. Update the `TASK.md` state header:
   - `Status: correction_required`
   - `Next actor: implementer`
   - update `Updated:`
   Then update `NEXT.md`.
5. Ask which severity band to fix: critical, high, or all.
6. Fix only the approved findings. Do not broaden scope.
7. Do not print credentials or PII.
8. Do not rewrite Git history, rotate credentials, merge, or deploy.
9. Respect the bounded repair limit: 3 correction cycles.
10. Re-run the documented checks.
11. Set `Status: awaiting_review`, `Next actor: verifier`, and update `NEXT.md`.
12. Request a fresh independent review and record `REVIEW-02.md` when required.
13. On PASS, set `Status: ready_to_commit`, `Next actor: human`, and report the
    exact path list and commit gate.
14. Report evidence, residual risk, and the commit gate.

If a finding requires a scope, policy, auth, payment, schema, or risk decision,
stop and ask the human.
If the task revision changed, stop and require new approval.
