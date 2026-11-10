# Tool Adapters

AME is tool-independent. The shared core defines engineering responsibilities and contracts. Each tool gets an adapter.

Do not try to make one agent configuration file work across tools.

```text
AME Core
  → Tool adapter
  → Native agent configuration
```

## What is shared

- principles;
- roles and authority;
- workflows;
- risk classes;
- verification contract;
- handoff contract;
- evidence standard;
- style guide;
- templates.

## What is tool-specific

- agent file format;
- permission syntax;
- skill discovery paths;
- command syntax;
- session/child model;
- worktree support;
- model selection;
- UI.

## OpenCode V2

Primary adapter.

Mapping:

| AME | OpenCode V2 |
|---|---|
| Lead | `ame-lead`, `mode: primary` |
| Subagent | `mode: subagent` + `subagent` tool |
| Delegation allowlist | parent `subagent` permissions |
| Child session | `parentID` session |
| Background | `background: true` |
| Verification | read-only subagent |
| Approval | `question` tool + permission `ask` |
| Skills | `.agents/skills` or `.opencode/skills` |
| Commands | `.opencode/commands` |
| Worktrees | separate root sessions; native Git strategy is detached HEAD |
| Config | `opencode.jsonc`, `agents`, `permissions` |

Requirements:

- V2 `@opencode/cli` 2.2.x or later;
- `AGENTS.md` (V2 does not use `CLAUDE.md` as a fallback);
- project instructions in `AGENTS.md`;
- per-agent permissions.

Limitations:

- child sessions inherit the parent directory;
- no per-child worktree;
- default subagent depth 1;
- read-only is policy, not a sandbox;
- background job durability not guaranteed;
- shell has host authority.

## OpenCode V1 fallback

V1 uses:

- `agent` instead of `agents`;
- `permission` instead of `permissions`;
- `task` instead of `subagent`;
- `command` instead of `commands`.

V1 fallback:

- sequential by default;
- manual git branches/worktrees;
- no V2 child-session/job UI assumptions;
- keep the same role contracts, but reduce orchestration claims.

## Claude Code

Mapping:

| AME | Claude Code |
|---|---|
| Lead | primary agent / main thread |
| Subagent | Agent tool subagent |
| Delegation allowlist | `Agent(...)` allowlist when supported |
| Read-only verifier | tool allowlist (Read/Grep/Glob) |
| Worktree isolation | opt-in per subagent where supported |
| Instructions | `CLAUDE.md`, also reads `AGENTS.md` if present |
| Skills | `.claude/skills` or shared skill paths |
| Hooks | tool/lifecycle hooks |

Notes:

- Claude Code has richer per-subagent isolation than OpenCode V2.
- Agent Teams is experimental; do not make it a required AME dependency.
- Team members may share a working directory; file ownership is not enforced.
- Verify current behaviour against the installed version.

## OpenAI Codex

Mapping:

| AME | Codex |
|---|---|
| Lead | main thread |
| Subagent | parallel subagent threads |
| Instructions | `AGENTS.md` |
| Skills | Codex skills |
| Permissions | session-level sandbox/permission profiles |
| Worktrees | chat/session-level worktrees |
| Review | `/review` and review workflows |

Notes:

- Subagents inherit session sandbox/approval settings.
- A custom agent cannot generally override the session sandbox.
- Read-only verification may require a read-only session or a separate review run.
- No per-lead subagent allowlist is guaranteed; verify the installed version.

## DeepSeek Harness (DSH)

DSH is a developer-preview harness with a named subagent tree, messaging, task board, workflow/ralph, sandbox modes, and worktrees. It is architecturally close to AME, but features and stability vary by version.

Mapping:

| AME | DSH |
|---|---|
| Lead | primary agent |
| Subagent | `subagent` tool |
| Investigator | read-only/exploration agent |
| Verifier | sandboxed read-only agent |
| Task board | Team/task DAG where available |
| Worktree | experimental worktree tool |
| Instructions | `AGENTS.md` / `CLAUDE.md` |

Notes:

- Do not assume Agent Teams is stable.
- Worktrees and write scopes may be advisory, not enforced.
- Verify against the installed version.
- Provide a sequential fallback.

## Degradation rules

If a tool lacks a capability:

| Missing | Degrade to |
|---|---|
| Subagents | sequential roles in one session |
| Read-only subagent | separate review session + tool restrictions |
| Worktrees | sequential writes or manual git branches |
| Background jobs | foreground only |
| Permission allowlist | explicit instructions + human review |
| Hooks | command/checklist enforcement |

Never claim a capability the tool does not have.

## Adapter checklist

- [ ] Agent files load.
- [ ] Commands load.
- [ ] Skills are discoverable.
- [ ] Permissions restrict the verifier.
- [ ] Parent allowlist works.
- [ ] Child session appears in the UI.
- [ ] Worktree behaviour is understood.
- [ ] Background behaviour is understood.
- [ ] Instructions are loaded.
- [ ] Limitations are documented.
