---
description: Run a read-only architecture, security, consistency, or readiness audit
agent: ame-lead
subagent: false
---

Use the AUDIT workflow. This is read-only.

Scope: $ARGUMENTS

Requirements:

1. Define the audit questions and scope.
2. Gather evidence from the codebase, docs, config, and tests.
3. Check architecture boundaries, consistency, security, data, operations, and cost where relevant.
4. Rank findings by severity and expected value.
5. Record candidate follow-ups in the backlog.
6. Do not change code.

Output:

- scope;
- evidence;
- findings by severity;
- candidates;
- recommended next actions;
- what was not audited.
