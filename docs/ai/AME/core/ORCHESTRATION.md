# Orchestration

This document describes how AME uses native OpenCode primitives. It is an adapter, not a separate orchestration engine.

## Target

- Primary: **OpenCode V2** (`@opencode/cli`, 2.2.x or later).
- Fallback: OpenCode V1 (`opencode-ai`, 1.18.x/1.19.x), with reduced capability.

## The four layers

1. **Engineering method** — AME roles, workflows, risk, verification.
2. **Agent orchestration** — delegation, contracts, evidence, ownership.
3. **Execution environment** — OpenCode sessions, subagents, permissions, worktrees.
4. **Human interface** — Desktop, TUI, API, logs, diffs.

The method must not depend on a particular dashboard.

## Native primitives

### Primary agent

A primary agent runs the main session. `ame-lead` is a custom primary agent.

- `mode: primary`
- selected per session;
- can use tools according to its permissions;
- owns integration.

### Subagent

A subagent runs in a child session.

- `mode: subagent`
- launched by the `subagent` tool;
- fresh context;
- foreground or background;
- returns a final text result to the parent;
- can be continued with its `sessionID`.

### Child session

- has `parentID`;
- inherits the parent’s working directory/location;
- appears in the Desktop timeline;
- can be opened, inspected, and interrupted;
- cannot be given a separate worktree by the native subagent tool.

### Background

- `background: true` returns immediately;
- the parent is notified when the child completes;
- do not poll;
- use only for independent work;
- background job durability across server restart is not assumed.

### Concurrency

- Multiple tool calls in one assistant step may run concurrently.
- Multiple `subagent` calls in one step can run concurrently.
- There is no dependency graph or scheduler.
- Do not launch parallel tasks that depend on each other.

### Depth

`experimental.subagent_depth` defaults to `1`.

- Lead can spawn children.
- Children cannot spawn further subagents by default.
- Keep the default unless there is a proven need.

### Permissions

- Parent `subagent` rules are the allowlist.
- Child agents use their own permissions.
- Child permissions are not a subset of the parent’s.
- Session-scoped rules are inherited at child creation.
- `deny` wins over `ask`; the last matching rule wins.
- Shell runs with host authority; it is not an OS sandbox.

## One parent session

Normal AME experience:

```text
User
  → ame-lead (parent session)
      → investigator child
      → architect child
      → implementer child
      → verifier child
```

The user selects the Lead once. The Lead decides which specialists to call.

## Front door

The user should not need to remember the workflow commands.

- `/ame <request>` is the universal entry point.
- Plain language is also valid when `ame-lead` is the selected agent.
- The Lead classifies the request and states the route.
- The specific commands are optional shortcuts.

If the installer creates a new project config, it sets
`"default_agent": "ame-lead"`. Existing configs are not modified automatically.

Routing table:

| Intent | First action |
|---|---|
| New feature or change | Plan and grill |
| Bug | Reproduce and investigate |
| Review | Read-only review |
| Fix `REVIEW-*.md` | Remediation |
| Audit | Read-only audit |
| “Continue” | Resume from `ACTIVE.md` |
| Tiny clear change | Implement and verify |

The Lead asks one question only when the intent is genuinely ambiguous. It does
not ask the user to choose a slash command.

### When separate root sessions are useful

- independent tasks;
- parallel writers in separate worktrees;
- long headless work;
- human supervision of unrelated workstreams.

Separate sessions do not share AME task state. Do not treat them as coordinated children.

## Delegation rules

The Lead should delegate when:

- investigation is non-trivial and read-only;
- architecture needs a fresh-context analysis;
- implementation is bounded and sizable;
- verification must be independent;
- a specialist risk area is triggered.

The Lead should not delegate when:

- the task is trivial;
- the work is already conclusive;
- coordination cost exceeds value;
- the specialist would duplicate the Lead;
- the task is urgent and sequential is safer.

## Handoff

Every child gets a complete contract. A child does not see the parent transcript.

Minimum:

- objective;
- scope and non-goals;
- files owned;
- acceptance criteria;
- constraints;
- test commands;
- evidence required;
- return format.

## Results

- Foreground child: parent waits and receives the final text.
- Background child: parent receives a synthetic completion message.
- Failure: parent receives an error with the child `sessionID`; it can continue the child.
- The parent does not automatically receive the full child transcript.

This is why the return contract matters.

## Parallelism

| Activity | Parallel? | Isolation |
|---|---|---|
| Read-only investigation | Yes | Same directory; no edits |
| Architecture research | Yes | Same directory; no edits |
| Independent module implementation | Conditional | Disjoint files, or separate root sessions/worktrees |
| Overlapping file edits | No | Sequential |
| Integration | No | Lead owns |
| Verification | One verifier after integration | Read-only |

Rules:

- No parallel writes in one worktree.
- No parallel implementation before the API/data contract is fixed.
- No parallel work without explicit file ownership.
- If isolation is unavailable, execute sequentially.

## Task artifacts

For L2/L3 and R2/R3, the Lead keeps durable state:

```text
docs/ai/ACTIVE.md              # pointer to the active task
docs/ai/runs/<task-id>/
├── TASK.md                    # authoritative contract and state
├── RUN_LOG.md                 # evidence
├── NEXT.md                    # resume bookmark
└── REVIEW-*.md                # independent findings
```

- `ACTIVE.md` is a pointer only: task id, branch, updated time, and task path.
- `TASK.md` is authoritative for status, revision, approval, next actor, and
  commit gate.
- `NEXT.md` records the current step and exact next action. It is a bookmark, not
  a second state store.
- `REVIEW-*.md` records independent findings.
- The Verifier is read-only; the Lead writes the review report.
- If documents disagree, live Git and `TASK.md` win.
- The Lead updates `ACTIVE.md` at task start and `NEXT.md` at phase boundaries.

L1 uses a single run log. `NEXT.md` is optional for L1.

See `core/RESUMPTION.md` and `/ame-resume`.

## Context budget

Every L2/L3 `TASK.md` should name the minimum context:

```text
Must read:
Read only if unclear:
Do not read by default:
```

The default must-read set is:

- `AGENTS.md`;
- `docs/ai/PROJECT_PROFILE.md`;
- `TASK.md`;
- the exact source/test files owned by the task.

Do not read the whole `docs/ai/` tree, unrelated modules, generated files, or
historical run logs by default. Broaden only when evidence shows it is needed.

If a required document contradicts the task, stop and report it. Do not guess.

L1 tasks do not need a full context budget; read only the relevant files and
record the result in the run log.

## One writer

Only one actor may modify the working tree at a time. Do not start a second
implementation session to help a running one. Parallel implementation requires
separate worktrees and explicit ownership.

## Session continuity

A session can compact, crash, or end. On resume:

1. resolve the task through `docs/ai/ACTIVE.md`;
2. read `TASK.md`, `RUN_LOG.md`, `NEXT.md`, and the latest review;
3. inspect live Git;
4. report the state and next action;
5. wait for confirmation before editing.

Never infer the active task from chat history, model memory, timestamps,
directory order, or the most recent file.

## Worktrees

V2 supports:

- `worktree.directory` config;
- Code Mode `worktree_create`, `worktree_list`, `worktree_remove`;
- session move;
- `opencode run --worktree`;
- Desktop worktree picker.

Important:

- Native Git strategy uses `git worktree add --detach`.
- It does not create a branch automatically.
- Create a branch manually for integration.
- A worktree is a separate root session, not a child subagent.
- Merging is not proof of correctness; verify the integrated result.

## Desktop supervision

Native Desktop provides:

- child sessions as timeline rows;
- subagent status and elapsed time;
- activity capsule;
- child breadcrumb navigation;
- background job visibility;
- worktree/location picker.

A third-party dashboard is not required.

## Failure handling

- Child returns incomplete work: send a follow-up with `sessionID`.
- Child fails: inspect the error; retry, narrow the task, or reassign.
- Child exceeds budget: stop, narrow scope, or switch model.
- Child edits wrong files: stop, revert, re-contract.
- Parent context becomes overloaded: compact, start a new session, or hand off.

## Limits

- Default depth 1.
- No scheduler.
- No per-child worktree.
- No built-in verifier sandbox.
- No guarantee of background durability.
- Desktop UI behaviour depends on version.

Do not claim capabilities the runtime does not have.

## V1 fallback

V1 can support:

- primary agents;
- subagents via the task tool;
- permissions;
- commands and skills;
- sequential execution.

V1 does not provide the same V2 worktree, child-session UI, or job surface. If V1 is used:

- default to sequential;
- use manual git branches;
- do not assume V2 configuration syntax;
- keep the same role contracts, but degrade orchestration.

## Configuration locations

Global:

```text
~/.config/opencode/agents/
~/.agents/skills/
~/.config/opencode/AGENTS.md
```

Project:

```text
.opencode/agents/
.opencode/commands/
.agents/skills/
AGENTS.md
docs/ai/AME/
```

Use project-local copies when reproducibility matters.
