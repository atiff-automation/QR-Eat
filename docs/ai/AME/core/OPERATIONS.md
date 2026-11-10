# Operations and Release

AME does not end at “accepted.” A full-stack flow includes release, observation, and learning.

## Environments

Define:

- local;
- test/CI;
- staging;
- production.

Rules:

- staging resembles production closely enough to catch integration, config, and migration issues;
- secrets differ per environment;
- production data is not copied to lower environments without anonymization;
- configuration is documented.

## CI/CD

Minimum pipeline:

1. install dependencies from lockfile;
2. lint;
3. typecheck;
4. unit/integration tests;
5. build;
6. migration check;
7. security/dependency scan where practical;
8. deploy to staging;
9. smoke test;
10. production deploy with approval;
11. post-deploy verification.

## Release

Separate deploy from release where possible:

- feature flags;
- canary or staged rollout;
- dark launch;
- rollback plan;
- migration plan.

Release approval is human-owned.

## Database migrations

- prefer expand/contract;
- keep migrations forward-compatible;
- test on a copy;
- back up before destructive change;
- have rollback or forward-fix;
- never run production migrations from a verifier.

## Observability

Minimum:

- structured logs;
- correlation/request IDs;
- error tracking;
- metrics: latency, error rate, throughput, saturation;
- payment success/failure metrics;
- queue/backlog metrics;
- uptime check;
- alerts with an owner;
- dashboards that answer “is it healthy?”

## SLOs

Define simple targets:

- availability;
- latency for critical paths;
- error rate;
- payment success rate;
- background job lag.

Do not invent complex SLOs for a small product. Start with what users notice.

## Incidents

- severity levels;
- incident owner;
- communication channel;
- status page or user notification;
- mitigation before root cause;
- evidence preservation;
- postmortem;
- corrective actions with owners and dates.

## Backups and recovery

- automated backups;
- encryption;
- retention;
- restore drill;
- documented RTO/RPO;
- verify restore, not just backup.

## Data lifecycle

- classify data;
- map where it lives;
- retention;
- deletion;
- export;
- vendor processing;
- PII redaction in logs;
- test data anonymization.

## Cost

- infrastructure budget;
- model/token budget per task;
- alert on unusual spend;
- review unused services;
- avoid premature infrastructure.

## Agent operations

- track token/cost per task;
- cap steps and concurrency;
- monitor failures and retries;
- review background jobs;
- keep deploy credentials separate;
- audit tool use for sensitive actions.

## Release checklist

See `checklists/PRODUCTION_READINESS.md`.

## Post-release

- smoke test;
- watch errors/latency/payment;
- check user feedback;
- roll back on threshold breach;
- record outcome in the run log;
- add follow-ups to the backlog.
