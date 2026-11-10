# Evaluation

AME is a hypothesis: structured delegation and independent verification improve engineering outcomes without unreasonable cost.

Measure it. Do not assume it.

## Token discipline

- L1: no subagents unless the cause is unclear.
- L2: max 1 implementer + 1 verifier.
- L3: max 3 specialists unless risk justifies more.
- No architect on a one-file change.
- No security specialist on a non-sensitive change.
- No full review report on a clean L1/L2 PASS.
- No duplicate task/state/run-log artifacts.
- Do not re-read all core docs; use pointers.
- Stop if artifact cost exceeds task value.

Measure tokens and cost per task, not just outcome.

## Baseline

Before the pilot, record:

- current lead time for a similar task;
- current review time;
- current defect/escape rate if known;
- current token/cost usage if known;
- current human intervention level.

## Pilot metrics

For each pilot task:

| Metric | What it tells you |
|---|---|
| Time to classify/specify | Is the front-end process proportional? |
| Time to diagnose | Is investigation efficient? |
| Time to implement | Is delegation helping? |
| Number of corrections | Is the handoff clear? |
| Defects found by verifier | Is independent verification valuable? |
| Defects escaped | Is verification sufficient? |
| Integration effort | Is parallelism worth it? |
| Human interventions | Is the approval design right? |
| Token/model cost | Is the cost justified? |
| Rework after verification | Is the verdict meaningful? |

## Skill evaluation

For each skill:

1. Run a representative task without the skill.
2. Run the same task with the skill.
3. Compare behaviour, corrections, cost, and evidence.
4. Read the execution trace, not just the final answer.
5. Keep, revise, or remove the skill.

A skill that does not change behaviour is documentation, not a control.

## Role evaluation

Ask:

- Did the role add evidence the Lead would have missed?
- Did it add cost without value?
- Did it create conflicting verdicts?
- Did it slow the task unreasonably?

Remove or merge roles that do not earn their cost.

## Stop conditions

Stop or simplify when:

- the Lead delegates on trivial tasks;
- the verifier repeats the implementer;
- the handoff is longer than the task;
- parallel work creates more integration effort than it saves;
- cost exceeds task value;
- approvals become a bottleneck;
- documentation is not read or updated.

## Decision

At the end of the pilot:

- keep the current design;
- simplify;
- add one capability;
- stop and revert to the previous workflow.

Record the decision in `PHASE_STATUS.md` or the project run log.
