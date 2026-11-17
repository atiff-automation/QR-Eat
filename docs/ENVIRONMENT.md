# Environment variables

Variable **names only**. Never commit values, and never paste them into a run
log, review, screenshot or chat. Values live in the hosting provider's secret
store (Railway) or in an uncommitted local `.env` file.

## Required

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string for the application. |
| `JWT_SECRET` | yes | Signs the RBAC session token. Rotating it signs everyone out. |
| `LOYALTY_ENABLED` | loyalty only | **Only the literal string `true` enables loyalty.** Any other value, including `TRUE`, `1` or `yes`, is treated as off. |
| `LOYALTY_PHONE_HMAC_KEY` | loyalty only | Keyed HMAC for the member phone hash. Generate once per deployment with `openssl rand -hex 32`; never reuse across environments. Missing or changed after members exist makes existing members unresolvable. |

The canonical spelling is `LOYALTY_PHONE_HMAC_KEY` (H-M-A-C). A file that says
`LOYALTY_PHONE_HASH_KEY` is wrong: the code, the contract and the runbook all
read `LOYALTY_PHONE_HMAC_KEY`, so the wrong name silently falls back to guest
and makes Counter member attach fail.

## Existing deployment variables

These are read by the current deployment and are not new in the loyalty
release. Set the ones the deployment uses; leave the rest unset.

| Name | Purpose |
|---|---|
| `CRON_SECRET` | Bearer token for `/api/cron/cleanup-events`. The endpoint returns 503 when unset. |
| `APP_URL` | Public application URL used in links. |
| `NEXTAUTH_URL` | Auth callback base URL. |
| `NEXT_PUBLIC_BASE_URL` | Public base URL for client code. |
| `NEXT_PUBLIC_BASE_DOMAIN` | Base domain for tenant subdomains. |
| `NEXT_PUBLIC_MAIN_DOMAIN` | Main marketing/app domain. |
| `ENABLE_SUBDOMAIN_ROUTING` | Turns on tenant subdomain routing. |
| `RAILWAY_ENVIRONMENT` | Set by Railway. The trusted-edge-IP resolver only trusts `X-Real-IP`/`X-Forwarded-For` when this is present. |
| `RAILWAY_DATABASE_URL` | Railway-provided database URL (fallback for tooling). |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection for cache/realtime support. |
| `SENDGRID_API_KEY`, `FROM_EMAIL` | Transactional email. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web-push notifications. |
| `UPLOAD_BASE_DIR` | Local upload directory. |
| `EVENT_RETENTION_DAYS`, `EVENT_POLLING_INTERVAL_MS`, `EVENT_MAX_RETRY_ATTEMPTS` | Station event log tuning. |
| `RECALL_ENABLED`, `RECALL_WINDOW_MINUTES` | Station order recall. |
| `JWT_EXPIRES_IN` | Session token lifetime. |

## Local example file

The repository does not track an example env file: `.env*` is git-ignored, so
the local `.env.example` is not part of the diff and cannot be reviewed here.
If it exists locally, it must use `LOYALTY_PHONE_HMAC_KEY` (not
`LOYALTY_PHONE_HASH_KEY`). Do not commit any `.env` file.
