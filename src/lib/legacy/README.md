# Legacy Code

This directory contains code that is no longer actively used in the project but is preserved for reference.

## Files

### redis.ts.backup
Redis pub/sub implementation replaced by PostgreSQL NOTIFY/LISTEN for MVP.
- **Replaced by**: `src/lib/postgres-pubsub.ts`
- **Reason**: PostgreSQL NOTIFY/LISTEN is free (built-in) and doesn't require extra infrastructure
- **Status**: Not imported anywhere, safe to keep for future reference if Redis caching/session/rate-limiting is needed

**Migration Date**: 2025-12-07
