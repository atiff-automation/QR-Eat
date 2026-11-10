---
name: ame-engineering-discipline
description: Engineering discipline for implementation and review. Use when planning, writing, or reviewing code to enforce KISS, YAGNI, reuse-first, scope discipline, dependency approval, error handling, and tests. Prevents over-engineering and drive-by changes.
license: MIT
metadata:
  version: "0.1.0"
---

# AME Engineering Discipline

## Reuse first

Before creating a component, endpoint, error shape, or pattern:

1. search the canonical sources;
2. search the codebase;
3. reuse or extend;
4. if new, state why, get approval, document it.

Do not create a parallel pattern silently.

## KISS

Use the simplest design that correctly solves the confirmed problem.

KISS does not mean:

- the smallest diff even when the cause is structural;
- ignoring error handling, security, or tests;
- avoiding a necessary architecture correction.

## YAGNI

Do not build:

- speculative abstractions;
- generic engines for one use case;
- plugin systems without a second consumer;
- config layers without a real need;
- dependencies for one small utility.

Do not use YAGNI to skip required validation, accessibility, security, or error handling.

## DRY

Deduplicate knowledge, not lines.

- One source for a business rule.
- One error envelope.
- One money/date/ID convention.
- A little duplication is better than a premature abstraction.

## Scope

- Change only what the task requires.
- Do not refactor unrelated code.
- Do not rename unrelated files.
- Do not “fix” nearby code without approval.
- Record deviations.
- Separate refactor from feature/bug work.

## Dependencies

Before adding a dependency:

- check existing capabilities;
- check maintenance and license;
- check security and supply chain;
- check bundle/runtime cost;
- get approval;
- document why.

## Error handling

- Use the project’s error model.
- Do not leak internals.
- Make user-facing errors actionable.
- Preserve cause for logs where safe.
- Do not swallow errors silently.

## Tests

- Test behaviour at public seams.
- Add a regression test for bugs.
- Avoid tautological and implementation-coupled tests.
- Do not claim a test passed unless run.
- Do not lower coverage or skip tests to make a change pass.

## Review questions

- Is this the smallest correct change?
- Is the abstraction justified now?
- Is the logic in the right layer?
- Is there an existing pattern?
- Is anything unrelated changed?
- Is a dependency added? Why?
- Are errors and edge cases handled?
- Is the test meaningful?
