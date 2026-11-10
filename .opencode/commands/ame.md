---
description: Universal AME front door. Classify the request and route to planning, investigation, review, remediation, audit, or resume without making the user choose a command.
agent: ame-lead
subagent: false
---

Use AME. The user should not need to know which slash command to use.

Request: $ARGUMENTS

Requirements:

1. Read `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, `GLOSSARY.md`, and the
   relevant task artifacts.
2. Classify the intent:
   - new feature or behaviour change;
   - bug or unexpected behaviour;
   - review;
   - remediation of an existing review;
   - audit;
   - resume after a break;
   - tiny, clear change.
3. State the route in one line before acting.
4. If the intent is genuinely ambiguous, ask one question. Do not ask which
   slash command the user wants.
5. Start the safe first step:
   - **feature/change:** load `ame-grilling`, plan in rounds, write `TASK.md`,
     and stop for approval. Do not write product code.
   - **bug:** load `ame-debugging`, build a reproduction, investigate. Do not fix
     before the cause is understood.
   - **resume:** read `ACTIVE.md`, `TASK.md`, `RUN_LOG.md`, `NEXT.md`, the latest
     review, and live Git. Report the state and wait for confirmation.
   - **review:** run the read-only REVIEW workflow.
   - **remediation:** read the review and `TASK.md`; fix only approved findings.
   - **audit:** run the read-only AUDIT workflow.
   - **tiny change:** implement the smallest correct change, then request
     independent verification.
6. For L2/L3, write a context budget in `TASK.md`: must read / read only if
   unclear / do not read. Do not scan the whole repository by default.
7. For L2/L3, update `docs/ai/ACTIVE.md` and `NEXT.md`.
8. Do not perform a high-risk action without the required approval.
9. Do not treat a proposed plan, review PASS, or silence as approval.
10. Do not ask the user to remember `/ame-plan`, `/ame-bug`, or other shortcuts.
    Mention the shortcut only as an optional next-time hint.

Output:

```text
Route:
Why:
Action:
Approval needed:
```

Then proceed or ask the one blocking question.
