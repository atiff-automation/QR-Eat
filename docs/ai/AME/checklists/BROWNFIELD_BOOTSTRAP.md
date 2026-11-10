# Brownfield Bootstrap Checklist

## Before setup

- [ ] Git repository is clean or changes are understood
- [ ] Bootstrap branch created
- [ ] OpenCode V2 confirmed
- [ ] Kit validated with `scripts/validate-kit.sh`
- [ ] Target project path confirmed

## Baseline

- [ ] Build command recorded and run
- [ ] Test command recorded and run
- [ ] Lint command recorded and run
- [ ] Typecheck command recorded and run
- [ ] Current commit/branch recorded
- [ ] Pre-existing failures recorded
- [ ] Flaky tests recorded
- [ ] Missing commands recorded

## Project context

- [ ] `docs/ai/PROJECT_PROFILE.md` created and filled
- [ ] `AGENTS.md` created (max one page)
- [ ] `GLOSSARY.md` created (20–40 terms)
- [ ] `docs/ai/BACKLOG.md` created
- [ ] `docs/ai/ACTIVE.md` created (pointer only; `Task: none` at rest)
- [ ] `docs/ai/runs/` created
- [ ] Architecture map reviewed
- [ ] Sensitive areas reviewed
- [ ] Do-not-touch areas reviewed
- [ ] Known risks reviewed

## Install

- [ ] `.opencode/agents/` installed
- [ ] `.opencode/commands/` installed
- [ ] `.agents/skills/` installed
- [ ] `docs/ai/AME/core/` installed
- [ ] `docs/ai/AME/templates/` installed
- [ ] No secrets copied
- [ ] No project data copied into the kit

## Validate

- [ ] `ame-lead` visible
- [ ] `ame-verifier` visible
- [ ] `/ame`, `/ame-plan`, `/ame-bug`, `/ame-feature`, `/ame-review`, `/ame-fix`, `/ame-resume`, `/ame-audit` visible
- [ ] New project config sets `default_agent: ame-lead` (or the existing config is updated manually)
- [ ] Verifier cannot edit
- [ ] Verifier cannot spawn subagents
- [ ] `.env` read denied/ask
- [ ] Lead subagent allowlist works
- [ ] Child session appears in the UI

## Commit

- [ ] Bootstrap files committed separately
- [ ] Product code untouched
- [ ] Commit message clear
