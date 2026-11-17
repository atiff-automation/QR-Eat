# Process Gate Checklist

Use before implementation, before review, and before commit. This is a process
gate, not a code-quality review.

## Before implementation

- [ ] The task is approved for the exact revision.
- [ ] `Revision` equals `Approved revision`.
- [ ] `Status: ready_for_implementer`.
- [ ] `Next actor: implementer`.
- [ ] Scope, non-goals, and owned files are explicit.
- [ ] A context budget exists.
- [ ] Exactly one `ame-implementer` child will own the product code.
- [ ] The Lead will not edit product code.
- [ ] The implementer session ID will be recorded.

## Before review

- [ ] The implementer returned evidence, not only “done”.
- [ ] The implementer did not edit task state or commit.
- [ ] Changed files are within the owned files.
- [ ] New and untracked files are listed.
- [ ] Tests and required commands were run.
- [ ] `Status: awaiting_review`.
- [ ] `Next actor: verifier`.

## Before commit

- [ ] The verifier is a fresh `ame-verifier`, not the implementer.
- [ ] The verifier session ID is recorded.
- [ ] The review verdict is PASS.
- [ ] The review is bound to the current base commit and diff hash.
- [ ] The review file exists when required.
- [ ] Changed files are within the owned files.
- [ ] The exact path list is published.
- [ ] The exact commit message is published.
- [ ] Human authorization is recorded for R2/R3.
- [ ] No unrelated changes are staged.

## If any box is unchecked

Stop. Do not improvise. Record the blocker in `NEXT.md` and ask the human for a
decision or a new task revision.
