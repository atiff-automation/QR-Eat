import type { OrderEventPrintStatus } from '@prisma/client';

export type TicketAggregate =
  | 'NOT_ROUTED'
  | 'UNKNOWN'
  | 'QUEUED'
  | 'PARTIAL'
  | 'PRINTED'
  | 'FAILED';

export interface TicketEventState {
  printStatus: OrderEventPrintStatus | null;
  printedAt: Date | null;
  printError?: string | null;
}

/**
 * Aggregate one order's printable events. A ticket is printed only when every
 * routed station ticket has a positive print acknowledgement.
 */
export function aggregateTicketStatus(events: TicketEventState[]): {
  aggregate: TicketAggregate;
  printedAt: Date | null;
} {
  if (events.length === 0) {
    return { aggregate: 'NOT_ROUTED', printedAt: null };
  }

  const statuses = events.map((event) => event.printStatus);
  const printedAt =
    events
      .map((event) => event.printedAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  if (statuses.some((status) => status === 'FAILED')) {
    return { aggregate: 'FAILED', printedAt };
  }
  if (statuses.every((status) => status === 'PRINTED')) {
    return { aggregate: 'PRINTED', printedAt };
  }
  if (statuses.some((status) => status === 'PRINTED')) {
    return { aggregate: 'PARTIAL', printedAt };
  }
  if (statuses.some((status) => status === 'PENDING')) {
    return { aggregate: 'QUEUED', printedAt };
  }

  return { aggregate: 'UNKNOWN', printedAt };
}
