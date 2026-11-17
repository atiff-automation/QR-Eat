# Review 26 — QR-EAT-LOYALTY-PROMO-V1 · P10 (contract freeze)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P10
**Verifiers:** `ses_e25f21768ffekEmPklHQ1W8msg` (**FAIL**) · `ses_e25d3a1d5ffeUzwr1ytwvJCEEA` (**FAIL**) · `ses_e25c3415effev1iRb6B8ARuUe5` (**PASS**)
**Author:** Lead (documentation only)
**Date:** 2026-11-14 · **Risk:** R2 · **Base:** `b426412`
**Reviewed diff hash:** `db34e77140674b47eaabd3fbeb66a5fe8344df0af6d01f0abefd11fd1354ad2e`
**Documents:** `API-CONTRACT.md` `ccf8c30e…` · `RELEASE-COMPATIBILITY.md` `df81ccc5…` · `COUNTER-HANDOFF-LOYALTY.md` `210122c8…` · `OPEN-ITEMS.md` `d80b11e5…` · `TASK.md` `be83ab55…`

## Verdict

**PASS.** P10 closes. Two correction cycles, nineteen findings.

## What P10 produced

| Artifact | Content |
|---|---|
| `docs/PRODUCT/API-CONTRACT.md` | §18.20 addendum: activation, the full surface with permissions and idempotency, QR/Counter/owner shapes, state precedence, money and reporting, rate limits and the measured edge behaviour, privacy, offline, error registry, interpretation register, freeze record |
| `docs/PRODUCT/RELEASE-COMPATIBILITY.md` | Server candidate, contract version, unbuilt-client rows, loyalty addendum record, compatibility rules |
| `docs/PRODUCT/COUNTER-HANDOFF-LOYALTY.md` | Self-contained Counter handoff: endpoints, fields, states and copy, flows, six client-visible changes, error handling, build checklist |
| `OPEN-ITEMS.md` | P10 items recorded, M-3 and H-2 closed, the still-open items listed with owners |

## What the reviews caught

The first review was **FAIL** with sixteen findings. The ones that mattered:

| Finding | Why it mattered |
|---|---|
| **R-01** | The table claimed `GET /api/promotions/{id}`; the route only has PATCH and DELETE. A Counter built to it would call a 404. |
| **R-02** | `PATCH /api/orders/{id}/modify` — the P5C re-evaluation route — was missing from the surface and from the handoff, so a Counter would not know how to make a promotion-covered visit count. |
| **R-03** | The register repeated a stale finding: `SecurityEvent.restaurantId` exists and loyalty events populate it. |
| **R-04** | `cashPayable = round5(...)` was stated unconditionally; under `cashRounding = NONE` there is no rounding. |
| **R-05** | "Cross-tenant returns 404" ignored that the counter bill routes return 403. |
| **R-06** | "No HMAC key ⇒ loyalty off" hid a 500 on the Counter attach path. |
| **R-07** | "Phone stored as a keyed HMAC" omitted that E.164 is stored too. |

The second review confirmed all sixteen fixed and raised three new: the payments replay endpoint requires **`payments:read`**, not `payments:write` (medium); the owner-configurable restaurant ceiling needed a register row; `PATCH /api/members/{id}` was missing from the surface.

All corrected. The third review passed and confirmed the surface table matches the code row by row.

## Verified

- **Docs only:** no `src/`, `prisma/` or `package*` change; the candidate `e5f6046` is still the last commit that changed server behaviour.
- **No Tabtep file touched:** the `Tabtep-App-loyalty` worktree is clean.
- **Surface accuracy:** every row's permission and idempotency requirement matches `src/app/api/**`.
- **Register completeness:** P10-1…P10-14, M-3, P7c-3, P7-8, P7d-1/4, P8-1/2/6, P9-09, P9-10.
- **Money:** `gross = Σ subtotal`, `net = Σ totalAmount − refunds`, refunds on the refund day, Z order block from positive payments only; P8-6 marked unsigned.
- **Handoff:** no run-directory references, no placeholders; all six client-visible changes correct.
- **No regression:** 1383 passed / 11 skipped; type-check clean.

## Notes

| ID | Note | Route |
|---|---|---|
| P10-14 | The restaurant ceiling is owner-set (1–1000, default 30) against §18.20.15 B's 30/h — registered | Addendum |
| P7-8 | Counter bill reads return 403 for cross-tenant, not 404 | Handoff error table |
| P8-6 | `net` includes tax and service — **still unsigned** | Owner / accountant |
| — | The frozen hash is a **candidate**; P11 may change code, so the final stamp is a two-line amendment after PASS | P11 |

## Not verified

- A live Counter consuming the handoff (it does not exist yet).
- The P9 drill counts and the Railway measurement were taken as recorded, not re-run.
- OpenAPI generation (explicit non-goal).

## Residual risk

- The addendum is the Counter's normative source; an error in it becomes an error in another repository. That is why two FAIL cycles were worth the time.
- P8-6 remains an unsigned accounting judgement.
- The candidate hash is not final until P11 passes.
