# Counter Done Filter and Late-Close Rollover

Date: 2026-11-01

## Problem

Counter → Orders → Done displayed served/cancelled orders from every business
date because the Android client always requested `allDates=true`.

The 04:00 cutoff is not an automatic close event. Business days close manually,
and the client did not clear its Done cache after a successful close.

## Changes

- Counter history requests now use the current open business day only.
- Done state tracks the business date and replaces stale data when the date
  changes.
- A successful close clears the Counter Done cache.
- Done copy now states that orders belong to the current business day.
- Late close next-day logic now jumps to the current business date instead of
  always creating `businessDate + 1`.
- Added business-day helper tests for normal, before-cutoff and late closes.

## Verification

- QR-Eat TypeScript: **0 errors**
- QR-Eat Jest: **416 passed**, 11 skipped
- QR-Eat production build: **passed**
- Counter network test: **passed**
- Counter debug compile: **passed**
- No schema changes
- No version bump
