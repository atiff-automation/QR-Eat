/**
 * Print acknowledgement authority and transition rules
 * (`phase-b-print-v1` §4.4, §5.2, §7.4).
 *
 * This module is deliberately pure: both ack routes call the same planner so
 * the device and Counter paths cannot drift. It never reads the database and
 * never returns HTTP responses.
 */

import type { OrderEventPrintStatus } from '@prisma/client';
import {
  normalizeStationSettings,
  type PrintMode,
} from '@/lib/station-settings';

export type PrintAckSource = 'DEVICE' | 'COUNTER';
export type PrintAckAction = 'success' | 'failure' | 'skipped';
export type PrintAckResult = 'PRINTED' | 'FAILED' | 'SKIPPED' | 'NO_DOWNGRADE';
export type PrintedBy = 'DEVICE' | 'COUNTER';

/** Default skip / failure strings keep the existing device vocabulary. */
export const DEFAULT_SKIP_ERROR = 'KDS only — not printed';
export const DEFAULT_FAILURE_ERROR = 'Printer failed';
export const DEFAULT_REPRINT_FAILURE_ERROR = 'Reprint failed';

export interface TicketPrintState {
  printStatus: OrderEventPrintStatus | null;
  printAttemptedAt: Date | null;
  printedAt: Date | null;
  printError: string | null;
  printDeviceId: string | null;
}

export interface PrintAckPlan {
  /** False when the caller is not the print authority (409). */
  allowed: boolean;
  /**
   * True for a device `skipped` on `COUNTER`/`NONE`: the attempt is recorded in
   * the audit trail only and the event row is not touched (C-13).
   */
  auditOnly: boolean;
  /** Full next event print state. Equal to `current` for audit-only acks. */
  next: TicketPrintState;
  result: PrintAckResult;
  /** A failure/skip was refused because `PRINTED` is terminal. */
  downgraded: boolean;
  /** The same effective status already existed (idempotent repeat). */
  replayed: boolean;
}

/**
 * Authority matrix (§4.4). A device may always report a deliberate `skipped`
 * so the audit trail shows it saw the ticket, but only `STATION` lets it
 * change the ticket.
 */
export function isAckAuthorized(
  source: PrintAckSource,
  printMode: PrintMode,
  action: PrintAckAction
): boolean {
  if (source === 'COUNTER') return printMode === 'COUNTER';
  if (printMode === 'STATION') return true;
  return action === 'skipped';
}

/** Read the server-stamped mode from an event payload, if any. */
export function resolvePayloadPrintMode(payload: unknown): PrintMode | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).printMode;
  return value === 'STATION' || value === 'COUNTER' || value === 'NONE'
    ? value
    : null;
}

/**
 * Effective mode: stamped payload value, else the station's current setting,
 * else `STATION` (§4.3, §6.2).
 */
export function resolveEffectivePrintMode(
  payload: unknown,
  stationSettings: unknown
): PrintMode {
  return (
    resolvePayloadPrintMode(payload) ??
    normalizeStationSettings(stationSettings).printMode
  );
}

/** Translate the legacy body flags into the matrix action. */
export function printAckAction(
  success: boolean,
  skipped: boolean
): PrintAckAction {
  if (success) return 'success';
  if (skipped) return 'skipped';
  return 'failure';
}

function stateOf(current: TicketPrintState): TicketPrintState {
  return { ...current };
}

/**
 * Apply §5.2 from the print authority's point of view.
 *
 * `error` is the caller-supplied message. `printDeviceId` is the device id for
 * a device ack; a Counter ack always clears it (the audit row keeps the prior
 * value).
 */
export function planPrintAck(input: {
  source: PrintAckSource;
  printMode: PrintMode;
  action: PrintAckAction;
  current: TicketPrintState;
  now: Date;
  error?: string | null;
  printDeviceId?: string | null;
}): PrintAckPlan {
  const { source, printMode, action, current, now } = input;
  const error = input.error ?? null;
  const deviceId = source === 'DEVICE' ? (input.printDeviceId ?? null) : null;

  if (!isAckAuthorized(source, printMode, action)) {
    return {
      allowed: false,
      auditOnly: false,
      next: stateOf(current),
      result: 'NO_DOWNGRADE',
      downgraded: false,
      replayed: false,
    };
  }

  // C-13: a non-authority device skip is audit-only.
  if (source === 'DEVICE' && printMode !== 'STATION' && action === 'skipped') {
    return {
      allowed: true,
      auditOnly: true,
      next: stateOf(current),
      result: 'SKIPPED',
      downgraded: false,
      replayed: false,
    };
  }

  const wasPrinted = current.printStatus === 'PRINTED';

  if (action === 'success') {
    return {
      allowed: true,
      auditOnly: false,
      next: {
        printStatus: 'PRINTED',
        printAttemptedAt: now,
        printedAt: current.printedAt ?? now,
        printError: null,
        printDeviceId: deviceId,
      },
      result: 'PRINTED',
      downgraded: false,
      replayed: wasPrinted,
    };
  }

  // PRINTED is terminal for status. The attempt is still recorded, and the
  // audit row marks it NO_DOWNGRADE.
  if (wasPrinted) {
    return {
      allowed: true,
      auditOnly: false,
      next: {
        ...current,
        printAttemptedAt: now,
        printError:
          action === 'failure'
            ? error || DEFAULT_REPRINT_FAILURE_ERROR
            : current.printError,
        printDeviceId: source === 'DEVICE' ? deviceId : null,
      },
      result: 'NO_DOWNGRADE',
      downgraded: true,
      replayed: false,
    };
  }

  if (action === 'skipped') {
    return {
      allowed: true,
      auditOnly: false,
      next: {
        printStatus: 'SKIPPED',
        printAttemptedAt: now,
        printedAt: current.printedAt,
        printError: error || DEFAULT_SKIP_ERROR,
        printDeviceId: deviceId,
      },
      result: 'SKIPPED',
      downgraded: false,
      replayed: current.printStatus === 'SKIPPED',
    };
  }

  return {
    allowed: true,
    auditOnly: false,
    next: {
      printStatus: 'FAILED',
      printAttemptedAt: now,
      printedAt: current.printedAt,
      printError: error || DEFAULT_FAILURE_ERROR,
      printDeviceId: deviceId,
    },
    result: 'FAILED',
    downgraded: false,
    replayed: current.printStatus === 'FAILED',
  };
}

/**
 * `printedBy` is the last authoritative ack source (§5.2 rule 6, §6.2):
 * `DEVICE` when a device id is still recorded, `COUNTER` when printed with no
 * device id, otherwise null.
 */
export function derivePrintedBy(state: {
  printStatus: OrderEventPrintStatus | null;
  printDeviceId: string | null;
}): PrintedBy | null {
  if (state.printDeviceId) return 'DEVICE';
  if (state.printStatus === 'PRINTED') return 'COUNTER';
  return null;
}

/** `canAck` is true only for Counter authority (§6.2). */
export function canAck(printMode: PrintMode): boolean {
  return printMode === 'COUNTER';
}

/** Project the stored enum; legacy null is `UNKNOWN`, never `PRINTED`. */
export function projectPrintStatus(
  status: OrderEventPrintStatus | null
): OrderEventPrintStatus | 'UNKNOWN' {
  return status ?? 'UNKNOWN';
}

/**
 * B3 Counter auto-print projection (`phase-b-counter-feed-v1` §6).
 *
 * Additive: B2 ignores this field and keeps its own `order.created` /
 * `order.items.added` rule. A cancellation chit starts `SKIPPED` under
 * `COUNTER` (B2 compatibility) but is still auto-printable until it is
 * `PRINTED`; every other mode is never Counter authority.
 */
export function counterAutoPrint(
  type: string,
  printMode: PrintMode,
  printStatus: OrderEventPrintStatus | 'UNKNOWN' | null
): boolean {
  if (printMode !== 'COUNTER') return false;

  if (type === 'order.created' || type === 'order.items.added') {
    return printStatus === 'PENDING' || printStatus === 'FAILED';
  }

  if (type === 'order.cancelled') {
    return printStatus !== 'PRINTED';
  }

  return false;
}

/**
 * Audit description for a print ack (§7.4, §8.6). A reprint is only
 * `print.reprint` when a first print already existed; otherwise the attempt is
 * an ordinary ack.
 */
export function printAuditDescription(
  reprint: boolean,
  previouslyPrintedAt: Date | null
): 'print.reprint' | 'print.ack' {
  return reprint && previouslyPrintedAt !== null
    ? 'print.reprint'
    : 'print.ack';
}

/** Audit values never contain the ticket payload or customer data (§7.4). */
export function printAuditValues(state: TicketPrintState): {
  printStatus: OrderEventPrintStatus | null;
  printedAt: string | null;
  printError: string | null;
  printDeviceId: string | null;
} {
  return {
    printStatus: state.printStatus,
    printedAt: state.printedAt?.toISOString() ?? null,
    printError: state.printError,
    printDeviceId: state.printDeviceId,
  };
}
