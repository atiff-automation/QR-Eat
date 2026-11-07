-- KDS-only stations deliberately do not print. A skipped acknowledgement is
-- not a printer failure, so it needs its own terminal state.
ALTER TYPE "OrderEventPrintStatus" ADD VALUE 'SKIPPED';
