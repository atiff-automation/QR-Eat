import { aggregateTicketStatus } from '@/lib/counter/ticket-status';

const printedAt = new Date('2026-11-07T10:00:00.000Z');

function event(status: 'PENDING' | 'PRINTED' | 'FAILED' | 'SKIPPED') {
  return {
    printStatus: status,
    printedAt: status === 'PRINTED' ? printedAt : null,
  };
}

describe('aggregateTicketStatus', () => {
  it('treats an all-skipped KDS-only ticket as skipped, not failed', () => {
    expect(aggregateTicketStatus([event('SKIPPED')]).aggregate).toBe('SKIPPED');
    expect(
      aggregateTicketStatus([event('SKIPPED'), event('SKIPPED')]).aggregate
    ).toBe('SKIPPED');
  });

  it('keeps a real printer failure louder than a skip', () => {
    expect(
      aggregateTicketStatus([event('SKIPPED'), event('FAILED')]).aggregate
    ).toBe('FAILED');
  });

  it('reports mixed printed and skipped stations as partial', () => {
    expect(
      aggregateTicketStatus([event('PRINTED'), event('SKIPPED')]).aggregate
    ).toBe('PARTIAL');
  });

  it('still reports pending work as queued', () => {
    expect(
      aggregateTicketStatus([event('SKIPPED'), event('PENDING')]).aggregate
    ).toBe('QUEUED');
  });

  it('keeps the existing printed and failed aggregates', () => {
    expect(aggregateTicketStatus([event('PRINTED')]).aggregate).toBe('PRINTED');
    expect(aggregateTicketStatus([event('FAILED')]).aggregate).toBe('FAILED');
    expect(aggregateTicketStatus([]).aggregate).toBe('NOT_ROUTED');
  });
});
