---
name: ame-debugging
description: Diagnosis loop for hard bugs and performance regressions. Use when the user reports something broken, failing, throwing, slow, or asks to debug or diagnose. Builds a red-capable feedback loop before hypothesising, then fixes the cause and adds regression coverage.
license: MIT
metadata:
  version: "0.1.0"
---

# AME Debugging

A discipline for meaningful bugs. Do not jump to a fix.

## Redact

Before showing commands, outputs, logs, or screenshots, remove secrets and PII. Use `<REDACTED>`. If the redacted output is insufficient, say so and ask for a safe artifact.

## Phase 1 — Build a feedback loop

The goal is one command that goes **red on this bug** and green when fixed.

Prefer, in order:

1. a failing test at the right seam;
2. an HTTP/curl script against a dev server;
3. a CLI invocation with a fixture;
4. a headless browser script;
5. a replayed request/trace;
6. a minimal harness around the failing path;
7. a property/fuzz loop;
8. a bisection harness;
9. a differential old-vs-new loop;
10. a human-in-the-loop script as a last resort.

The loop must be:

- red-capable: drives the real bug path and asserts the user’s symptom;
- deterministic, or high-reproduction for flaky bugs;
- fast: seconds, not minutes;
- agent-runnable.

If you cannot build a loop, stop. List what you tried and ask for:

- access to the reproducing environment;
- a redacted captured artifact;
- permission for temporary instrumentation.

Do not proceed to hypotheses without a loop.

## Phase 2 — Reproduce and minimise

- Confirm the failure matches the user’s symptom.
- Capture the exact error/wrong output/timing.
- Shrink the repro one input, caller, config, or step at a time.
- Keep only what is load-bearing.
- For flaky bugs, raise the reproduction rate until it is debuggable.

Do not proceed until reproduced and minimised.

## Phase 3 — Hypotheses

Generate 3–5 ranked hypotheses before testing any.

Each must be falsifiable:

> “If X is the cause, changing Y will make the bug disappear; changing Z will make it worse.”

If you cannot state a prediction, discard or sharpen it.

Show the ranked list to the user when practical. Domain knowledge can re-rank instantly.

## Phase 4 — Instrument

Each probe maps to one prediction. Change one variable at a time.

Prefer:

1. debugger/REPL;
2. targeted logs at boundaries that distinguish hypotheses;
3. never “log everything and grep.”

Tag temporary logs with a unique prefix, e.g. `[DEBUG-a4f2]`.

For performance bugs:

- establish a baseline measurement first;
- use a profiler or query plan;
- bisect;
- measure again after the fix.

## Phase 5 — Fix and regression test

Write the regression test **before** the fix, if a correct seam exists.

A correct seam exercises the real bug pattern at the call site. If no correct seam exists, record that as an architectural finding; do not create a false-confidence test.

Then:

1. watch the test fail;
2. apply the smallest correct fix;
3. watch it pass;
4. re-run the original Phase 1 loop.

Distinguish:

- root-cause correction;
- architectural correction;
- temporary mitigation;
- symptom suppression;
- unverified workaround.

A temporary mitigation must be labelled, owned, and assigned a follow-up.

## Phase 6 — Cleanup

Before declaring done:

- original repro no longer reproduces;
- regression test passes, or missing seam is documented;
- all `[DEBUG-...]` instrumentation removed;
- throwaway prototypes removed;
- the confirmed cause is recorded in the run log/commit;
- neighbouring behaviour checked;
- residual risk recorded.

## Output

Return:

```text
Symptom:
Reproduction:
Root cause:
Evidence:
Fix:
Regression test:
Neighbouring checks:
Residual risk:
```

Do not claim “fixed” unless the original loop was re-run.

## Correction limit

Maximum 3 correction cycles inside the approved task. A cycle is an
implementation correction, not diagnosis. If the third cycle still fails, or the
fix needs a scope, policy, auth, payment, schema, or dependency decision, stop
and escalate.
