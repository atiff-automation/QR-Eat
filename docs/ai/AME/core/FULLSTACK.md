# Full-Stack Flow

AME owns the flow and gates across product, UX, UI, frontend, backend, data, and operations. It does not try to replace each discipline’s craft guide.

## The loop

```text
Product intent
→ UX flow
→ UI states
→ design review
→ architecture + API/data contract
→ frontend + backend build
→ integration
→ verification
→ release
→ observe
→ learn
```

## What AME owns

- when UX/design decisions happen;
- who decides;
- required artifacts;
- approval gates;
- verification criteria;
- integration ownership;
- release and feedback.

## What AME does not own

- brand strategy;
- detailed UX research method;
- visual design system implementation;
- framework-specific frontend patterns;
- backend framework internals;
- cloud vendor configuration.

Those live in discipline guides and project profiles.

## Product intent

Before design, define:

- target user;
- problem;
- job to be done;
- outcome;
- success metric;
- non-goals;
- risk.

If the problem is unclear, do not start with screens.

## UX flow

For L2/L3:

- entry points;
- main path;
- alternative paths;
- error paths;
- permissions;
- empty state;
- recovery;
- exit.

The flow is about behaviour, not pixels.

## UI states

Every screen defines:

| State | Required |
|---|---|
| Empty | What the user sees before data |
| Loading | Progress without layout jump |
| Error | Actionable message and recovery |
| Success | Confirmation and next step |
| Partial | What worked, what failed |
| Permission denied | Explanation and path forward |
| Mobile | Same task, reflowed |

Most AI-generated UI builds only the success state. This matrix prevents that.

## Design review

Before implementation, ask:

1. Are we reusing existing components and patterns?
2. Are all states defined?
3. Is the copy clear?
4. Is it accessible?
5. Is it feasible with the API/data?
6. Is the scope proportional?

The human approves the direction.

## Design levels

### L1 — Tiny UI change

- reuse existing pattern;
- short note;
- verify copy, layout, accessibility.

### L2 — Normal feature

- user flow;
- state matrix;
- low-fidelity wireframe;
- component reuse;
- copy;
- accessibility;
- responsive rules;
- design approval.

### L3 — New product area / complex flow

- discovery;
- information architecture;
- prototype;
- small usability test;
- design-system impact;
- accessibility plan;
- explicit approval.

### Redesign

Separate project. Do not mix with a feature.

## Contract-first

Before parallel frontend/backend work:

- define the API contract;
- define request/response/errors/auth;
- define shared enums and field names;
- define money, dates, IDs;
- define pagination/filtering if relevant;
- approve the contract.

```text
UI behaviour
   ↔ API contract
   ↔ data model
```

The contract is the bridge. Without it, frontend and backend guess.

## Frontend guide

The project should define:

- component boundaries;
- page vs component vs hook;
- state and data fetching;
- validation;
- error boundaries;
- design tokens;
- accessibility;
- performance budget;
- test layers.

Verification:

- all states;
- keyboard and focus;
- labels and errors;
- contrast;
- responsive;
- no one-off tokens;
- contract respected;
- Core Web Vitals not regressed.

## Backend guide

The project should define:

- domain boundaries;
- API style/versioning;
- validation;
- authz;
- transactions;
- idempotency;
- error model;
- migrations;
- observability;
- rate limits;
- secrets.

Verification:

- contract;
- authz per endpoint;
- validation;
- data integrity;
- idempotency;
- migration safety;
- error handling;
- tests.

## Data flow

Define:

- schema and constraints;
- indexes;
- ownership/tenancy;
- retention/deletion;
- backup/restore;
- migration strategy;
- test data;
- reporting vs transactional use.

## Server and operations

Before production:

- environments;
- secrets;
- CI/CD;
- smoke tests;
- rollback;
- observability;
- alerts;
- backups;
- incident runbook;
- cost monitoring;
- release approval.

## Human ownership

The human owns:

- product outcome;
- UX judgment;
- visual taste;
- risk acceptance;
- release.

Agents facilitate, draft, implement, and verify. They do not own the product.

## Definition of Done

A user-facing feature is done when:

- flow works end-to-end;
- all states exist;
- copy is clear;
- accessibility checks pass;
- responsive works;
- performance budget respected;
- components/tokens reused;
- API contract matches;
- authz/validation/data integrity verified;
- tests exist;
- docs/run log updated;
- human accepts.

## Parallelism

- Frontend/backend parallel only after contract approval.
- Disjoint file ownership.
- Otherwise sequential.
- Lead integrates.
- Verifier checks the integrated result.
