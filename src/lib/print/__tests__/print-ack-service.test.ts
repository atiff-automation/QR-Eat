import {
  canAck,
  derivePrintedBy,
  isAckAuthorized,
  planPrintAck,
  printAckAction,
  printAuditDescription,
  projectPrintStatus,
  resolveEffectivePrintMode,
  resolvePayloadPrintMode,
  type PrintAckAction,
  type PrintAckSource,
  type TicketPrintState,
} from '@/lib/print/print-ack-service';
import type { PrintMode } from '@/lib/station-settings';

const now = new Date('2026-11-17T10:00:05.000Z');
const firstPrint = new Date('2026-11-17T09:59:00.000Z');

function state(overrides: Partial<TicketPrintState> = {}): TicketPrintState {
  return {
    printStatus: 'PENDING',
    printAttemptedAt: null,
    printedAt: null,
    printError: null,
    printDeviceId: null,
    ...overrides,
  };
}

describe('print ack authority matrix (§4.4)', () => {
  const actions: PrintAckAction[] = ['success', 'failure', 'skipped'];

  function matrix(source: PrintAckSource, mode: PrintMode) {
    return Object.fromEntries(
      actions.map((action) => [action, isAckAuthorized(source, mode, action)])
    );
  }

  it('lets a device print, fail and skip on STATION', () => {
    expect(matrix('DEVICE', 'STATION')).toEqual({
      success: true,
      failure: true,
      skipped: true,
    });
  });

  it('only lets a device skip on COUNTER and NONE', () => {
    expect(matrix('DEVICE', 'COUNTER')).toEqual({
      success: false,
      failure: false,
      skipped: true,
    });
    expect(matrix('DEVICE', 'NONE')).toEqual({
      success: false,
      failure: false,
      skipped: true,
    });
  });

  it('only lets the Counter act on COUNTER', () => {
    expect(matrix('COUNTER', 'COUNTER')).toEqual({
      success: true,
      failure: true,
      skipped: true,
    });
    expect(matrix('COUNTER', 'STATION')).toEqual({
      success: false,
      failure: false,
      skipped: false,
    });
    expect(matrix('COUNTER', 'NONE')).toEqual({
      success: false,
      failure: false,
      skipped: false,
    });
  });

  it('maps legacy body flags to the matrix action', () => {
    expect(printAckAction(true, true)).toBe('success');
    expect(printAckAction(false, true)).toBe('skipped');
    expect(printAckAction(false, false)).toBe('failure');
  });
});

describe('print mode resolution (§4.3)', () => {
  it('prefers the stamped payload mode over the live setting', () => {
    expect(
      resolveEffectivePrintMode(
        { printMode: 'COUNTER' },
        { printMode: 'STATION' }
      )
    ).toBe('COUNTER');
  });

  it('falls back to the station setting, then STATION', () => {
    expect(resolveEffectivePrintMode({}, { printMode: 'NONE' })).toBe('NONE');
    expect(resolveEffectivePrintMode({}, {})).toBe('STATION');
    expect(resolveEffectivePrintMode(null, null)).toBe('STATION');
  });

  it('ignores a non-string or unknown stamped value', () => {
    expect(resolvePayloadPrintMode({ printMode: 'PRINTER' })).toBeNull();
    expect(resolvePayloadPrintMode({ printMode: 3 })).toBeNull();
    expect(resolvePayloadPrintMode(null)).toBeNull();
  });

  it('only allows Counter acks on COUNTER', () => {
    expect(canAck('COUNTER')).toBe(true);
    expect(canAck('STATION')).toBe(false);
    expect(canAck('NONE')).toBe(false);
  });
});

describe('print transition matrix (§5.2)', () => {
  it('prints a pending ticket and records the first printedAt', () => {
    const plan = planPrintAck({
      source: 'DEVICE',
      printMode: 'STATION',
      action: 'success',
      current: state(),
      now,
      printDeviceId: 'device-1',
    });

    expect(plan.allowed).toBe(true);
    expect(plan.next).toEqual({
      printStatus: 'PRINTED',
      printAttemptedAt: now,
      printedAt: now,
      printError: null,
      printDeviceId: 'device-1',
    });
    expect(plan.result).toBe('PRINTED');
    expect(plan.downgraded).toBe(false);
    expect(plan.replayed).toBe(false);
  });

  it('keeps printedAt and the device id on an idempotent device success', () => {
    const plan = planPrintAck({
      source: 'DEVICE',
      printMode: 'STATION',
      action: 'success',
      current: state({
        printStatus: 'PRINTED',
        printedAt: firstPrint,
        printDeviceId: 'device-1',
      }),
      now,
      printDeviceId: 'device-1',
    });

    expect(plan.next.printStatus).toBe('PRINTED');
    expect(plan.next.printedAt).toBe(firstPrint);
    expect(plan.next.printAttemptedAt).toBe(now);
    expect(plan.replayed).toBe(true);
  });

  it('never downgrades PRINTED on a failed reprint', () => {
    const plan = planPrintAck({
      source: 'DEVICE',
      printMode: 'STATION',
      action: 'failure',
      current: state({ printStatus: 'PRINTED', printedAt: firstPrint }),
      now,
      printDeviceId: 'device-2',
    });

    expect(plan.next.printStatus).toBe('PRINTED');
    expect(plan.next.printedAt).toBe(firstPrint);
    expect(plan.next.printError).toBe('Reprint failed');
    expect(plan.next.printDeviceId).toBe('device-2');
    expect(plan.result).toBe('NO_DOWNGRADE');
    expect(plan.downgraded).toBe(true);
  });

  it('never downgrades PRINTED on a late skip', () => {
    const plan = planPrintAck({
      source: 'DEVICE',
      printMode: 'STATION',
      action: 'skipped',
      current: state({ printStatus: 'PRINTED', printedAt: firstPrint }),
      now,
      printDeviceId: 'device-2',
    });

    expect(plan.next.printStatus).toBe('PRINTED');
    expect(plan.next.printedAt).toBe(firstPrint);
    expect(plan.result).toBe('NO_DOWNGRADE');
    expect(plan.downgraded).toBe(true);
  });

  it('moves PENDING to FAILED and later to PRINTED', () => {
    const failed = planPrintAck({
      source: 'COUNTER',
      printMode: 'COUNTER',
      action: 'failure',
      current: state(),
      now,
      error: 'Out of paper',
    });
    expect(failed.next.printStatus).toBe('FAILED');
    expect(failed.next.printError).toBe('Out of paper');

    const printed = planPrintAck({
      source: 'COUNTER',
      printMode: 'COUNTER',
      action: 'success',
      current: failed.next,
      now,
    });
    expect(printed.next.printStatus).toBe('PRINTED');
    expect(printed.next.printError).toBeNull();
    expect(printed.next.printedAt).toBe(now);
  });

  it('allows SKIPPED to become PRINTED', () => {
    const plan = planPrintAck({
      source: 'COUNTER',
      printMode: 'COUNTER',
      action: 'success',
      current: state({ printStatus: 'SKIPPED' }),
      now,
    });
    expect(plan.next.printStatus).toBe('PRINTED');
  });

  it('records a Counter skip with no device id', () => {
    const plan = planPrintAck({
      source: 'COUNTER',
      printMode: 'COUNTER',
      action: 'skipped',
      current: state(),
      now,
    });
    expect(plan.next.printStatus).toBe('SKIPPED');
    expect(plan.next.printError).toBe('KDS only — not printed');
    expect(plan.next.printDeviceId).toBeNull();
    expect(plan.result).toBe('SKIPPED');
  });

  it('a Counter ack clears the prior device id but keeps printedAt', () => {
    const plan = planPrintAck({
      source: 'COUNTER',
      printMode: 'COUNTER',
      action: 'success',
      current: state({
        printStatus: 'PRINTED',
        printedAt: firstPrint,
        printDeviceId: 'device-1',
      }),
      now,
    });

    expect(plan.next.printDeviceId).toBeNull();
    expect(plan.next.printedAt).toBe(firstPrint);
    expect(derivePrintedBy(plan.next)).toBe('COUNTER');
  });
});

describe('device audit-only skip (C-13)', () => {
  it('does not change ticket state on COUNTER', () => {
    const current = state({
      printStatus: 'PENDING',
      printedAt: null,
      printDeviceId: null,
    });
    const plan = planPrintAck({
      source: 'DEVICE',
      printMode: 'COUNTER',
      action: 'skipped',
      current,
      now,
      printDeviceId: 'device-1',
    });

    expect(plan.allowed).toBe(true);
    expect(plan.auditOnly).toBe(true);
    expect(plan.next).toEqual(current);
    expect(plan.next.printStatus).toBe('PENDING');
    expect(plan.next.printDeviceId).toBeNull();
    expect(plan.result).toBe('SKIPPED');
  });

  it('does not change a FAILED or PRINTED ticket on NONE', () => {
    for (const printStatus of ['FAILED', 'PRINTED'] as const) {
      const current = state({
        printStatus,
        printedAt: printStatus === 'PRINTED' ? firstPrint : null,
      });
      const plan = planPrintAck({
        source: 'DEVICE',
        printMode: 'NONE',
        action: 'skipped',
        current,
        now,
        printDeviceId: 'device-1',
      });
      expect(plan.auditOnly).toBe(true);
      expect(plan.next).toEqual(current);
    }
  });
});

describe('projections and audit helpers', () => {
  it('never projects a null print status as PRINTED', () => {
    expect(projectPrintStatus(null)).toBe('UNKNOWN');
    expect(projectPrintStatus('PENDING')).toBe('PENDING');
  });

  it('derives printedBy from the last authoritative ack source', () => {
    expect(
      derivePrintedBy({ printStatus: 'PRINTED', printDeviceId: 'device-1' })
    ).toBe('DEVICE');
    expect(
      derivePrintedBy({ printStatus: 'PRINTED', printDeviceId: null })
    ).toBe('COUNTER');
    expect(
      derivePrintedBy({ printStatus: 'FAILED', printDeviceId: null })
    ).toBe(null);
  });

  it('uses print.reprint only when a first print already existed', () => {
    expect(printAuditDescription(true, firstPrint)).toBe('print.reprint');
    expect(printAuditDescription(true, null)).toBe('print.ack');
    expect(printAuditDescription(false, firstPrint)).toBe('print.ack');
  });
});
