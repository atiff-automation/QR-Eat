# Review 21 — QR-EAT-LOYALTY-PROMO-V1 · P7d (owner rename)

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P7d
**Verifiers:** `ses_e27667c6dffeg2iD4B7RomlszM` (PASS WITH NOTES) · `ses_e27523646ffe4sbB18MeT0gYDj` (correction, **PASS**)
**Implementer:** `ses_e277828c1ffeYcwuHD0KFX7Sui`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `c66a828`

## Verdict

**PASS.** No remediation required. P7c-10 is closed, and P7 closes with it.

| Item | Value |
|---|---|
| Tracked diff | `bf028a34ec2065ef7d4b35fb214cefee5b4cb0d1b6fe70a2de404285691feca7` |
| `loyalty-member-service.ts` | `43160af11a34e4fede481c644fe1c76cce5a01ed0b6ac321a6c3c79a72854ac7` |

## Why this was needed

P7c-7 made the member name **write-once**, which closed an unauthenticated rename — but left no corrective path. A name mistyped at first enrolment could only be fixed by anonymise-and-re-enrol. The contract expects the alternative: *"changing an existing name requires `members:pii` and is audited."*

## Delivered

`PATCH /api/members/[id]` with `{ name: string | null }` — trimmed, 80 characters, `null` clears. Requires `members:pii` and an `Idempotency-Key`. Tenant-scoped, cross-tenant 404, anonymised members rejected. A member-profile "Edit name" control rendered only for `members:pii` holders.

## Verified

- **Permission:** `members:pii`, not `members:read`; the UI control is gated on the same permission.
- **Audit:** written in the same transaction, carrying actor, target, `purpose: 'member rename'`, and booleans only — **no old or new name** anywhere in the row.
- **Race (F-02, found by review and fixed):** the write is now conditional on `restaurantId` + `status: 'ACTIVE'`; on `count !== 1` it re-reads and returns anonymised/not-found with **no name write, no audit row, no receipt**. Both interleavings with `deleteMember` end with `ANONYMIZED ⇒ name IS NULL`.
- **Tenant isolation:** the read and the write both assert `restaurantId`; cross-tenant is 404.
- **Validation:** server-side twice (zod and service); 81 rejected; trim verified.
- **Idempotency:** fresh key per submit; a replay does not re-run the mutation.
- **PII:** no name in logs, audit metadata or the 24h receipt; the request hash is keyed (`hashPhone`) because a name is low-entropy.
- **Write-once intact:** the QR and Counter attach paths still cannot rename.
- **Accessibility:** 40px input per the web standard, 44px submit, label, `aria-invalid`, `aria-describedby`, `role="alert"`.

## Notes carried

| ID | Note | Route |
|---|---|---|
| P7d-1 | After an owner **clears** a name, a later enrolment by the same phone re-captures one — "write-once" means "set only when empty" | P10 record |
| P7d-2 | `count !== 1` always reports `MEMBER_ANONYMIZED`; safe with two statuses, wrong if a third is added | Comment/code note |
| P7d-3 | A replayed rename re-reads the live member, so an intervening rename changes the replayed body; the mutation is never re-run | Accepted |
| P7d-4 | Historical `Order.customerName` / `CustomerSession.customerName` copies keep the old name after a rename | P10 / product |
| P7d-5 | The 80-character bound exists on rename only; the attach path's `cleanName` is still unbounded | Backlog |

## Not verified

- Real-Postgres concurrency for the rename/anonymise interleaving (mocks only). **P9 should probe it.**
- Browser render of the name editor (static-markup page test).
- Whole-repo lint (excluded).

## Residual risk

- The race reasoning depends on Postgres re-checking the `WHERE` after a blocked update — correct under READ COMMITTED, which is the Prisma default.
- Same-model verification; a different-model pass is still owed at P11.
