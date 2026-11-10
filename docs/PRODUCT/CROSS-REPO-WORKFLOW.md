# Cross-Repo Workflow — Tabtep

**Status:** active · 2026-11-10

Tabtep has two repositories:

- `QR-Eat` — web, API, database, contract owner.
- `Tabtep-App` — Android Counter and Kitchen/Station.

One AME parent session cannot edit both repositories. Child sessions inherit one
working directory. Cross-repo work therefore needs explicit coordination.

## Rules

1. QR-Eat owns the contract.
2. Freeze the contract before client implementation.
3. Use separate sessions for each repository.
4. Do not edit `../QR-Eat` from a Tabtep session, or vice versa.
5. One product backlog item links both repo tasks.
6. Release the backend first in a backward-compatible form.
7. Verify the integrated behavior before removing compatibility.

## Flow

```text
Product decision
  → QR-Eat contract change + server tests
  → Freeze contract commit
  → Update Tabtep DTOs/tests/UI
  → Integration verification
  → Release server first
  → Release client
  → Update release compatibility
```

## Contract change checklist

- [ ] Is the change additive or breaking?
- [ ] Does it need a new path version?
- [ ] Are server tests updated?
- [ ] Is the contract index updated?
- [ ] Are client DTOs updated?
- [ ] Are client tests updated?
- [ ] Is old-client compatibility preserved?
- [ ] Is rollback possible?
- [ ] Is the release order recorded?

## What not to do

- Do not maintain two hand-written contracts.
- Do not change the client against an unfrozen API.
- Do not release a breaking server change before clients are ready.
- Do not let a client implement business rules that belong on the server.
- Do not run a single AME session across both repositories.
