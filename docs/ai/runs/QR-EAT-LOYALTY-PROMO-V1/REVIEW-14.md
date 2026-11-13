# Review 14 — QR-EAT-LOYALTY-PROMO-V1 · P6 close-out step 1

**Task:** `QR-EAT-LOYALTY-PROMO-V1` revision 2 · P6 close-out step 1 (Counter notice endpoint)
**Verifier:** `ses_e2a311999ffen0Cyq4Ze6gaPnT` · **Implementer:** `ses_e2a35162fffeqovjDRykVLrVNa`
**Date:** 2026-11-14 · **Risk:** R3 · **Base:** `931a2a3`

## Verdict

**PASS WITH NOTES.** The last missing contract endpoint now exists.

| Item | Value |
|---|---|
| Three files, combined | `906b6e171a17165e4c496219ca7b9a58cbfea25de899dfaff9e564fefa830bdd` |

## What was missing and why it mattered

`GET /api/counter/loyalty/notice` (§18.20.6) was the only contract endpoint never built. It is not cosmetic: member attach requires `consentVersion` + `consentTextHash` validated against the **server-derived** notice, and the Counter's only other source would be `GET /api/qr/{token}`, which it does not have. Without it a cashier could not capture consent at all.

## Verified

- **Shape:** exactly `{version, text, textHash, privacyUrl, termsText}` — nothing more. `textHash` is the server-derived `hashNoticeText(text)`; a stored hash that disagrees with the text makes `resolveNotice` return null, so the Counter can never receive a hash inconsistent with the text it displays.
- **Permission:** `loyalty:attach` plus the Counter role gate (owner/manager/cashier) — the same chain as the attach route.
- **Fail-closed:** global flag off returns **before any database read** (asserted). Settings disabled, missing, or an incomplete/inconsistent notice ⇒ `enabled: false`, `notice: null`, HTTP 200 — never a 500, never a partial notice usable for consent.
- **No member data:** the select covers settings fields only; the response keys are exactly `success/enabled/notice`; a test rejects `phoneHash|customerId|member|phone`.
- **Tenant isolation:** `restaurantId` from the authenticated context only — not path, not header.
- **It unblocks the Counter:** attach validates `consentVersion`/`consentTextHash` through the same `resolveNotice`/`verifyConsent` code, so the values match byte-for-byte.

## Notes

| ID | Note | Route |
|---|---|---|
| N-01 | `termsText` may be null while `enabled: true` — §18.20.15 B requires only version/text/hash/privacyUrl. Same as QR. | Document |
| N-02 | No integration test pins notice → attach; alignment verified by reading. A future change to either side could diverge silently. | Add when P6C1 wires the client |
| N-03 | The `RBACError` branch is unreachable (`requireAuth` throws plain `Error`); dead defensive code, same as the attach route | none |
| N-04 | The flag → settings → notice sequence is now inlined in three places | Cleanup, not this diff |

## Not verified

- No live database; `findUnique` is mocked.
- No end-to-end HTTP call against a running server.
- No client consumes the endpoint yet — **P6C1 is the wiring**, and the Android Counter is a separate repo.

## Residual risk

- Cashier-visible consent capture is not live until a client calls this endpoint. Server side is complete; the gap is wiring.
- No contract test binds notice → attach (N-02).
