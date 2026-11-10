# Consistency

## Purpose

Consistency means the same kind of problem is solved with the same pattern, unless there is a documented reason to differ.

AI-generated code tends to be locally plausible and globally inconsistent. AME treats consistency as a gate, not a hope.

## Dimensions

| Type | Example |
|---|---|
| Visual/UI | Three button styles; inconsistent spacing; different error colours |
| Frontend code | Three data-fetching patterns; duplicated form logic |
| API | Different error envelopes; different pagination |
| Cross-layer | API error not mapped to a useful UI message |
| Backend code | Business logic in routes; duplicate pricing |
| Documentation | Glossary, API docs, and code use different terms |

## Canonical sources

Keep these small and current:

```text
DESIGN_SYSTEM.md
COMPONENT_INVENTORY.md
API_CONVENTIONS.md
ARCHITECTURE.md
CODING_STANDARDS.md
GLOSSARY.md
PATTERNS.md
```

Each owns one kind of truth. Do not duplicate.

## Reuse-first rule

Before creating a component, endpoint, error shape, or pattern:

1. Search the canonical sources.
2. Search the codebase for an existing implementation.
3. Reuse or extend it.
4. If a new pattern is necessary, state why.
5. Get approval.
6. Document it.
7. Update the inventory.

Put this in the Lead, Architect, and Implementer prompts.

## New pattern approval

A new pattern is justified when:

- the existing pattern cannot solve the problem without harm;
- the new pattern is simpler or safer;
- the migration cost is understood;
- the pattern is documented;
- an owner accepts the maintenance.

A new pattern is not justified by:

- personal preference;
- novelty;
- a single use case that could be an extension;
- “the agent found it easier.”

## Hard checks

Use tooling for what can be checked mechanically:

- formatter;
- linter;
- typechecker;
- import boundaries;
- API schema lint;
- contract tests;
- generated types;
- secret scanning;
- stylelint/token checks;
- dead code/duplication checks.

## Soft checks

Use the Verifier for judgment:

- component reuse;
- naming;
- abstraction fit;
- error-message quality;
- UI state consistency;
- duplicated business rules;
- scope creep;
- documentation drift.

## Verifier checklist

- Did it reuse an existing component/endpoint/pattern?
- If new, was it approved and documented?
- Names match the glossary?
- Errors use the standard envelope?
- Dates, money, IDs, enums consistent?
- UI states match the state matrix?
- No duplicated logic?
- No parallel pattern without justification?
- New dependency justified?
- Inventory/docs updated?

## Periodic audit

Run monthly, before a major feature, or after an incident:

- find duplicated patterns;
- find boundary violations;
- find one-off styles;
- find inconsistent errors;
- find stale docs;
- propose consolidation candidates.

The audit proposes; the human prioritizes.

## Exceptions

An exception is allowed when:

- there is a documented reason;
- the scope is limited;
- an owner accepts it;
- it has an expiry or review date.

Record exceptions in ADRs or the run log. Do not let exceptions become invisible defaults.

## Do not create a consistency agent

Consistency is checked across roles:

- Architect owns patterns;
- Implementer reuses;
- Verifier checks;
- periodic audit finds drift.

If the checklist grows, add an `ame-consistency` skill, not a new agent.
