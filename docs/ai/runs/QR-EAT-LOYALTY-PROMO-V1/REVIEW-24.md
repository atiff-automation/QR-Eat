# Review 24 — QR-EAT-LOYALTY-PROMO-V1 · P9-10a (edge client-IP resolution)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P9-10a
**Verifier:** `ses_e26353cd1ffe1CqYsOG4j5QmYg` (PASS WITH NOTES)
**Implementer:** `ses_e264020b8ffe33ATbe72w6nS5F`
**Date:** 2026-11-14 · **Risk:** R2 (verifier treated it as R3) · **Base:** `78e8d8f`
**Tracked diff hash:** `9c0d610800e2a4ded403d17a21dbff46cc6a93c127b87a9ee1ebdac83bb9e5c1`
**Combined hash (12 paths):** `0f4c81508e7196fa650c9a1e0066185587ad44121180dede2946be1e5927ebd1`

## Verdict

**PASS WITH NOTES.** The defect is fixed and the regression test is red on the old code.

## What changed

`trustedIp()` read the **last** `X-Forwarded-For` entry. On Railway that entry is a
per-connection internal hop; the client is the **first** entry and is also `X-Real-IP`. The
`EDGE_IP` bucket was therefore keyed on a value that changed every request — the per-IP floor
limited nothing, and the `unknown` warning never fired because the header was present.

The resolver now lives in `src/lib/client-ip.ts`:

1. on Railway (`RAILWAY_ENVIRONMENT` set), `X-Real-IP` validated;
2. else on Railway, the **first** `X-Forwarded-For` entry;
3. else the socket peer, only if globally routable;
4. else `unknown`.

Off-Railway both headers are ignored — they are client-controlled without a proxy. Every
candidate must be a real, globally routable address: private, loopback, link-local, CGNAT,
unspecified, multicast, non-IP, port-bearing and zone-bearing values are rejected at every
position. A once-per-process canary warns when `X-Real-IP` and `XFF[0]` disagree.

## Verified

- **Red-capable regression:** `198.51.100.7, 203.0.113.9, 10.0.0.5` returns `198.51.100.7`;
  the old resolver returned `10.0.0.5`. The quote-route test also fails on the old code — the
  rotating hop meant the `EDGE_IP` bucket never reached its limit.
- **Gate not spoofable:** `RAILWAY_ENVIRONMENT` is process env, not header-derived. Off-Railway
  with forged headers returns `unknown`.
- **No non-routable subject:** every position is normalised; `100.64/10` (Railway's hop) and
  `::ffff:10.0.0.1` are rejected, `::ffff:1.2.3.4` is accepted.
- **Canary:** once per module instance, valid disagreement only, no address or request data.
- **Health:** `edgeIp: { source, xffEntries }`, no address; resolver adds no I/O.
- **No regression:** 1378 passed / 11 skipped; buckets and limits unchanged; no schema,
  migration or dependency; no dangling `loyalty/trusted-ip` imports.

## Notes

| ID | Note | Route |
|---|---|---|
| R-01 | The runbook still tells the operator to watch for the warning; it never mentions `edgeIp` | **P9-10b** (docs) |
| R-02 | The `request.ip` branch reports `source: 'socket'`; the union has no `'platform'` | P9-10b |
| R-03 | `edgeIp` is omitted from the two error payloads in `/api/health` | P9-10b |
| R-04 | Some special-use ranges (`192.0.0/24`, `198.18/15`, `192.88.99/24`) are accepted; not exploitable behind the edge | Backlog |
| R-05 | Port/zone cases are tested only at the `X-Real-IP` position; no health-route shape test | P9-10b |
| R-06 | `warnIfUnknownTrustedIp` says "X-Forwarded-For is missing"; `unknown` now has other causes too | P9-10b |
| R-07 | **Operational:** Railway's healthcheck may be internal, so `edgeIp.source` can read `unknown` there even when public traffic is fine. The runbook must say to check the **public** URL | **P9-10b** (docs) |

## Not verified

- A live Railway request (relied on `evidence/P9-10-edge-headers.txt`).
- Custom-domain edge behaviour.
- Whether Railway's healthcheck traverses the edge (R-07).
- "Once per process" under per-route bundling; the runbook says "module instance".

## Residual risk

- **R-07** is the one to carry: the diagnostic is only meaningful from outside.
- Special-use ranges (R-04) are theoretical behind an edge that overwrites the header.
- Same-model verification; P11 still owes a different-model pass.
