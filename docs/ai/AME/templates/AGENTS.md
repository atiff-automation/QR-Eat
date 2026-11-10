# {{PROJECT_NAME}} — Agent Instructions

This file is intentionally short. Deep methodology lives in `docs/ai/AME/core/`.

## Read first

- `docs/ai/PROJECT_PROFILE.md` — stack, commands, architecture, risks.
- `GLOSSARY.md` — domain terms.
- `docs/ai/AME/core/` — AME method and contracts.
- `docs/ai/BACKLOG.md` — current work.
- `docs/ai/ACTIVE.md` — pointer to the active task, if any.
- `docs/ai/runs/` — task evidence, `TASK.md`, `RUN_LOG.md`, `NEXT.md`.

Do not scan the whole codebase by default. For L2/L3, follow the context budget in
`TASK.md`: must read / read only if unclear / do not read.

## AME entry point

If you are unsure which AME command to use, run:

```text
/ame <request>
```

Or simply describe the task. The Lead classifies and routes it. The specific
commands are optional shortcuts.

## Commands

```text
Build:      {{BUILD_COMMAND}}
Test:       {{TEST_COMMAND}}
Lint:       {{LINT_COMMAND}}
Typecheck:  {{TYPECHECK_COMMAND}}
Run:        {{RUN_COMMAND}}
```

## Architecture

- `{{IMPORTANT_DIR}}` — {{RESPONSIBILITY}}
- `{{IMPORTANT_DIR}}` — {{RESPONSIBILITY}}
- `{{IMPORTANT_DIR}}` — {{RESPONSIBILITY}}

## Conventions

- {{CONVENTION_1}}
- {{CONVENTION_2}}
- {{CONVENTION_3}}

## Sensitive areas

Do not change without explicit human approval:

- `{{AUTH_AREA}}`
- `{{PAYMENT_AREA}}`
- `{{MIGRATION_AREA}}`
- `{{PRODUCTION_CONFIG_AREA}}`

## Do not touch

- `{{GENERATED_AREA}}`
- `{{VENDORED_AREA}}`
- `{{OTHER_DO_NOT_TOUCH}}`

## Known issues

- {{KNOWN_FAILURE_OR_FLAKY_TEST}}

## Rules

- Reuse existing patterns before creating new ones.
- Do not add a dependency without approval.
- Do not expand scope silently.
- Do not claim a test passed unless it was run.
- Do not put secrets or PII in prompts, logs, or screenshots.
- Update the run log and docs when behaviour changes.
