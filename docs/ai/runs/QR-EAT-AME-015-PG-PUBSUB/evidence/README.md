# AME-015 evidence - single-flight PostgreSQL pub/sub

Recorded 2026-11-19 on branch `fix/ame-015-single-flight-pubsub` (base `main`
`024f22d`), local only. No production or staging system was contacted.

Cycle 0 (initial implementation) and correction cycle 1 (review findings
R-01..R-05) are both recorded here.

## Environment

| Item | Value |
|---|---|
| Node.js | v24.15.0 (local; CI uses Node 20) |
| npm | 11.12.1 |
| PostgreSQL | 16.15, disposable cluster under /tmp/opencode/ame015/pg, port 55433, database qreat_gate015, trust auth, loopback only |
| App server | npm run start (production mode) on 127.0.0.1:3015 |
| Fixtures | docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/evidence/fixtures.cjs, adapted locally; two synthetic tenants with @gate.invalid staff emails |
| Local auth setup | a disposable local-only secret kept under /tmp/opencode (outside the repository), never printed, deleted after the run |

No local environment file was created or read. Nothing sensitive is reproduced
in these files: the synthetic fixture tokens stayed in /tmp and are not copied
here. All evidence files use a non-ignored extension so they are committable
(R-03).

## Setup commands

```text
/usr/lib/postgresql/16/bin/initdb -D /tmp/opencode/ame015/pg/data -A trust -U postgres --no-sync
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/opencode/ame015/pg/data -l /tmp/opencode/ame015/pg/server.log -o "-p 55433 -k /tmp/opencode/ame015/pg -c listen_addresses=127.0.0.1" start
/usr/lib/postgresql/16/bin/createdb -h 127.0.0.1 -p 55433 -U postgres qreat_gate015
npx prisma migrate deploy     # disposable database url supplied in the environment
node fixtures-local.cjs       # local signing value supplied in GATE_JWT_KEY
npm run build
PORT=3015 npm run start
node run-focus.cjs
```

### Reproducibility (R-05)

`fixtures-local.cjs` and `run-focus.cjs` take every environment-specific input
from the environment and have defaults that work on a local disposable setup:

| Variable | Default | Meaning |
|---|---|---|
| `GATE_REPO` | repository root, resolved from the script location | root used for node_modules |
| `GATE_DB_URL` | local loopback disposable url | database for fixtures / harness |
| `GATE_JWT_KEY` | none: required for fixtures | local disposable signing value |
| `GATE_FIXTURES_OUT` | tmpdir/ame015-fixtures.json | fixtures output path |
| `GATE_FIXTURES` | tmpdir/ame015-fixtures.json | fixtures input path for the harness |
| `GATE_BASE` | http://127.0.0.1:3015 | server base url |
| `GATE_OUT` | tmpdir/ame015-focus-results.json | harness results path |

No absolute implementer path or fixed database URL is hardcoded any more. The
correction-cycle-1 integration run used the committed scripts with their
defaults.

## Focused two-tenant concurrent-SSE script

`run-focus.cjs` mirrors B3-S gate case 5 and adds one probe:

1. open tenant A and tenant B `/api/events/orders` streams concurrently on the
   cold route path (the race that produced two LISTEN clients);
2. create an order, add an item, cancel the order through the real API as tenant
   A, so the real producers dual-write and publish;
3. publish `table_status_changed` directly with `pg_notify` for tenant A and then
   tenant B, because `src/instrumentation.ts` never subscribes that channel while
   the SSE route does;
4. count frames per stream and assert exactly-once delivery, the B3-S
   `duplicateFrames` metric (signal frames minus 2), and tenant isolation.

## Results - cycle 0 (initial fix)

### Pre-fix code (base 024f22d, same database and server)

`focus-prefix.txt` / `focus-results-prefix.json`

```text
PASS 5.sse.delivered            addSignals=2 cancelSignals=2 duplicateFrames=2
FAIL 5.sse.delivered.exactly-once
PASS 5.sse.tenant-isolated      leaked=[]
FAIL 5.sse.additive-coverage    table_status_changed frames=2 (expected 1)
FAIL 5.sse.tenant-isolated.table-status   tableBOnA=0 tableBOnB=2
SUMMARY {"total":5,"failed":3,"duplicateFrames":2}
```

Every frame arrived twice on the tenant-A stream (order_created,
order_status_changed, kitchen_notification, order_items_added, order_cancelled,
table_status_changed), reproducing the B3-S observation. Tenant filtering still
leaked nothing to tenant B.

### Post-fix code

`focus-post.txt` / `focus-results.json`

```text
PASS 5.sse.delivered              add=200 cancel=200 addSignals=1 cancelSignals=1 duplicateFrames=0
PASS 5.sse.delivered.exactly-once
PASS 5.sse.tenant-isolated        leaked=[]
PASS 5.sse.additive-coverage      table_status_changed frames=1
PASS 5.sse.tenant-isolated.table-status  tableBOnA=0 tableBOnB=1
SUMMARY {"total":5,"failed":0,"duplicateFrames":0}
```

Frame types on the tenant-A stream (one each): connection, order_created,
order_status_changed, kitchen_notification, order_items_added, order_cancelled,
table_status_changed. Tenant B received only connection and its own
table_status_changed.

### Startup log

`server-startup.txt` contains the instrumentation boot lines:

```text
[Server Startup] Initializing PostgreSQL pub/sub...
[Server Startup] PostgreSQL pub/sub initialized successfully
```

So `src/instrumentation.ts` won the boot path and subscribed its five channels
before the first request. The pre-fix duplicates therefore came from the SSE
route's own module graph creating two LISTEN clients on the two concurrent first
connections. Post-fix the route graph creates one and every signal arrives once.

### Listener sessions in the running process (post-fix)

`pg-stat-activity-listen-sessions.txt` records two LISTEN-issuing sessions: one
whose last statement is `LISTEN restaurant_notification` (the instrumentation
channel list) and one whose last statement is `LISTEN table_status_changed` (the
route channel list). Next.js bundles `instrumentation.ts` and the route
separately, so each module graph has its own `pgPubSub` singleton and therefore
one LISTEN client. This is pre-existing Next behaviour, not a second listener
inside one graph; each graph's emitter serves only its own listeners, and the
end-to-end frame counts above are exactly-once. Recorded as `AME-017`.

## Results - correction cycle 1

The initialization ordering changed (the LISTEN client is now published only
after the NOTIFY connect succeeds), so the integration check was re-run from a
fresh database and a fresh build:

`focus-post-cc1.txt`, `focus-post-cc1-run2.txt`,
`focus-results-cc1.json`, `server-startup-cc1.txt`

```text
PASS 5.sse.delivered              add=200 cancel=200 addSignals=1 cancelSignals=1 duplicateFrames=0
PASS 5.sse.delivered.exactly-once
PASS 5.sse.tenant-isolated        leaked=[]
PASS 5.sse.additive-coverage      table_status_changed frames=1
PASS 5.sse.tenant-isolated.table-status  tableBOnA=0 tableBOnB=1
SUMMARY {"total":5,"failed":0,"duplicateFrames":0}
```

The second run returned the same numbers. Startup lines are identical to cycle 0
and `pg-stat-activity-listen-sessions-cc1.txt` repeats the two-session
observation (one per module graph).

## Results - correction cycle 2

`cleanup()` now invalidates an in-flight initialize pass through a generation
counter; an abandoned pass closes its client and rejects instead of publishing.
The integration check was re-run from a fresh database and a fresh build:

`focus-post-cc2.txt`, `focus-post-cc2-run2.txt`,
`focus-results-cc2.json`, `server-startup-cc2.txt`

```text
PASS 5.sse.delivered              add=200 cancel=200 addSignals=1 cancelSignals=1 duplicateFrames=0
PASS 5.sse.delivered.exactly-once
PASS 5.sse.tenant-isolated        leaked=[]
PASS 5.sse.additive-coverage      table_status_changed frames=1
PASS 5.sse.tenant-isolated.table-status  tableBOnA=0 tableBOnB=1
SUMMARY {"total":5,"failed":0,"duplicateFrames":0}
```

The second run returned the same numbers; the startup line and the two-session
observation (one per module graph) are repeated in the `-cc2` files.

## Unit-level evidence

Suite: `src/tests/postgres-pubsub-single-flight.test.ts` (17 tests at correction
cycle 2; 15 at cycle 1; 9 at cycle 0).

| Evidence file | Code under test | Result |
|---|---|---|
| `unit-red-proof.txt` | pre-fix `024f22d` (cycle-0 suite, 9 tests) | 6 failed, 3 passed |
| `correction-red-proof.txt` | cycle-0 library with the 15-test suite | 2 failed (the two R-02 tests), 13 passed |
| `mutation-first-caller-wins.txt` | cycle-1 library plus `if (previous) return previous;` | 1 failed (the R-01 additive-union test), 14 passed |
| `cc2-red-proof.txt` | cycle-1 library with the 17-test suite | 2 failed (the two F-1 abandonment tests), 15 passed |
| normal run | cycle-2 library | 17/17 passed |

The cycle-2 red proof rebuilt `src/lib/postgres-pubsub.ts` to its cycle-1 state
(no generation guard), ran the suite, then restored the file byte-for-byte:
`sha256sum src/lib/postgres-pubsub.ts` is
`50b926fd7e70178e76b0e8eccca7e31b49d8fec2863141af309648e18e22b07f` for the file
used by the final 19-test run and the integration run.

The mutant was applied to a `cp` backup of `src/lib/postgres-pubsub.ts`,
exercised, and removed by copying the backup back byte-for-byte (pre/post
`sha256sum` matched at the time). No cycle-1 hash is quoted: that file was
reformatted by Prettier later in the cycle and changed again in correction
cycle 2, so the moment-in-time value is not reproducible (N-2). The only hash
quoted in this document is the final cycle-2 library hash above, and it does
reproduce.

## Cleanup

The disposable server and PostgreSQL cluster were stopped after the run, and the
local disposable secret file was deleted. Nothing was deployed, pushed, seeded
with `npm run db:seed`, or pointed at production.
