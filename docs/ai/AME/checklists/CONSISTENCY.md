# Consistency Checklist

## Canonical sources

- [ ] `DESIGN_SYSTEM.md`
- [ ] `COMPONENT_INVENTORY.md`
- [ ] `API_CONVENTIONS.md`
- [ ] `ARCHITECTURE.md`
- [ ] `CODING_STANDARDS.md`
- [ ] `GLOSSARY.md`
- [ ] `PATTERNS.md`

## Reuse

- [ ] Existing component reused?
- [ ] Existing endpoint reused?
- [ ] Existing error shape reused?
- [ ] Existing data-fetching pattern reused?
- [ ] New pattern approved?
- [ ] New pattern documented?

## Naming

- [ ] UI labels match glossary
- [ ] API fields match glossary
- [ ] Database names match glossary
- [ ] No synonym drift
- [ ] Error codes consistent

## Cross-layer

- [ ] Dates ISO/consistent
- [ ] Money minor units
- [ ] IDs consistent
- [ ] Enums shared
- [ ] Error mapping consistent
- [ ] Pagination consistent
- [ ] Auth model consistent

## UI

- [ ] Tokens used
- [ ] Spacing/typography consistent
- [ ] States consistent
- [ ] Copy tone consistent
- [ ] Icons consistent
- [ ] Responsive consistent

## Code

- [ ] Import boundaries respected
- [ ] Business logic in the right layer
- [ ] No duplicated business rules
- [ ] Error handling consistent
- [ ] Validation consistent
- [ ] Test patterns consistent

## Drift

- [ ] No one-off styles
- [ ] No parallel patterns
- [ ] No stale docs
- [ ] Exceptions documented
- [ ] Audit scheduled
