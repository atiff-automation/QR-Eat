# Product System Map — Tabtep

**Status:** active · 2026-11-10  
**Owner:** QR-Eat repository (contract and server semantics)

Tabtep is one product with two repositories.

```text
Customer QR / web dashboard
        │
        ▼
QR-Eat (Next.js web + API + PostgreSQL + Redis)
        │  HTTPS API + SSE
        ├──────────────► Tabtep Counter (Android)
        └──────────────► Tabtep Kitchen/Station (Android)
```

## Repository ownership

| Area | Owner | Notes |
|---|---|---|
| API contract | `QR-Eat` | Server is system of record |
| Database schema | `QR-Eat` | Prisma/migrations |
| Auth, RBAC, tenant isolation | `QR-Eat` | Server-authoritative |
| Payments and receipts | `QR-Eat` | Provider integration and webhooks |
| Web UI | `QR-Eat` | `docs/WEB-UI-STANDARD.md` |
| Product terminology | `QR-Eat` | `docs/TERMINOLOGY.md` |
| Data retention | `QR-Eat` | `docs/DATA-RETENTION.md` |
| Counter UX/implementation | `Tabtep-App` | `docs/UI-UX-PLAN.md` |
| Station/Kitchen UX/implementation | `Tabtep-App` | `docs/UI-UX-PLAN.md` |
| Device pairing, printing, SSE client | `Tabtep-App` | Client reliability |
| Release compatibility | `QR-Eat/docs/PRODUCT/` | This folder |

## Canonical sources

Do not duplicate these:

- API shape: `docs/PRODUCT/API-CONTRACT.md`
- cross-repo process: `docs/PRODUCT/CROSS-REPO-WORKFLOW.md`
- release compatibility: `docs/PRODUCT/RELEASE-COMPATIBILITY.md`
- product vocabulary: `docs/TERMINOLOGY.md`
- web UI: `docs/WEB-UI-STANDARD.md`
- native UX: `../Tabtep-App/docs/UI-UX-PLAN.md`
- Android architecture: `../Tabtep-App/docs/MASTER-REFERENCE.md`

## Non-negotiables

- Server is the system of record.
- Clients render state and send intents.
- No client business rules that can diverge from the server.
- Every mutating retry is idempotent.
- Every API change is backward-compatible or versioned.
- Cross-repo changes use a frozen contract and separate sessions.
