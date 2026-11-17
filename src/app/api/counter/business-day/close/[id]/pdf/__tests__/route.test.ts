import { NextRequest } from 'next/server';

const mockText = jest.fn();
const mockLine = jest.fn();
const mockDoc = {
  setFontSize: jest.fn(),
  text: mockText,
  line: mockLine,
  output: jest.fn(() => new ArrayBuffer(0)),
};

jest.mock('jspdf', () => ({
  jsPDF: jest.fn(() => mockDoc),
}));

jest.mock('@/lib/counter/reporting-access', () => ({
  getCounterReportingContext: jest.fn().mockResolvedValue({
    ok: true,
    value: { restaurantId: 'restaurant-1' },
  }),
  counterReportErrorResponse: jest.fn(),
}));

jest.mock('@/lib/services/reporting/counter-report-service', () => ({
  getClosedBusinessDay: jest.fn(),
}));

import { getClosedBusinessDay } from '@/lib/services/reporting/counter-report-service';
import { GET } from '../route';

function zReport() {
  return {
    businessDayId: 'day-1',
    businessDate: '2026-02-01',
    nextBusinessDate: '2026-02-02',
    zNumber: 'Z-260201-001',
    closedAt: '2026-02-01T12:00:00.000Z',
    closeNote: null,
    summary: {
      businessDate: '2026-02-01',
      status: 'CLOSED',
      timezone: 'Asia/Kuala_Lumpur',
      currency: 'MYR',
      asOf: '2026-02-01T12:00:00.000Z',
      openedAt: '2026-01-31T20:00:00.000Z',
      closedAt: '2026-02-01T12:00:00.000Z',
      netSales: '55.68',
      grossSales: '55.68',
      tax: '0.00',
      serviceCharge: '0.00',
      discounts: '10.00',
      discountBySource: { promotion: '7.00', reward: '3.00' },
      rewardTotal: '3.00',
      refunds: '5.00',
      refundsPriorPeriod: '2.50',
      orderCount: 1,
      averageCheck: '55.68',
      paymentMethods: [
        { method: 'cash', amount: '55.68', count: 1, rounding: '0.02' },
      ],
      roundingTotal: '0.02',
      cashReconciliation: {
        cashPayable: '55.70',
        cashReceived: '60.00',
        changeGiven: '4.30',
        checked: true,
        reconciled: true,
        legacy: false,
      },
      cashExpected: '155.70',
      cashCounted: '155.70',
      cashVariance: '0.00',
      openingFloat: '100.00',
      unpaidCount: 0,
      unpaidTotal: '0.00',
      blockers: [],
      topItems: [],
    },
  };
}

describe('Z report PDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClosedBusinessDay as jest.Mock).mockResolvedValue(zReport());
  });

  it('prints the cash reconciliation lines', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Cash payable: MYR 55.70');
    expect(lines).toContain('Cash received: MYR 60.00');
    expect(lines).toContain('Change given: MYR 4.30');
    expect(lines).toContain('Discounts: MYR 10.00');
    expect(lines).toContain('Promotion discounts: MYR 7.00');
    expect(lines).toContain('Reward total: MYR 3.00');
    expect(lines).toContain('Refunds: MYR 5.00');
    expect(lines).toContain('Prior-period refunds: MYR 2.50');
    expect(lines).toContain('Blockers');
    expect(lines).toContain('None');
    expect(lines).toContain('Reconciled: Yes');
  });

  it('prints "no rounded cash batches" when nothing was checked', async () => {
    const report = zReport();
    (getClosedBusinessDay as jest.Mock).mockResolvedValue({
      ...report,
      summary: {
        ...report.summary,
        cashReconciliation: {
          cashPayable: '0.00',
          cashReceived: '0.00',
          changeGiven: '0.00',
          checked: false,
          reconciled: false,
          legacy: false,
        },
      },
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Reconciled: No rounded cash batches');
  });

  it('says "not checked (legacy)" for a cash batch that predates cashPayable', async () => {
    const report = zReport();
    (getClosedBusinessDay as jest.Mock).mockResolvedValue({
      ...report,
      summary: {
        ...report.summary,
        cashReconciliation: {
          cashPayable: '0.00',
          cashReceived: '0.00',
          changeGiven: '0.00',
          checked: false,
          reconciled: false,
          legacy: true,
        },
      },
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Reconciled: Not checked (legacy)');
    expect(lines).not.toContain('Reconciled: No');
  });

  it('says "not checked (legacy)" for a snapshot without cash reconciliation', async () => {
    const report = zReport();
    const summary = { ...report.summary };
    delete (summary as { cashReconciliation?: unknown }).cashReconciliation;
    (getClosedBusinessDay as jest.Mock).mockResolvedValue({
      ...report,
      summary,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Reconciled: Not checked (legacy)');
    expect(lines).not.toContain('Reconciled: No');
  });

  it('still prints "No" when a checked reconciliation failed', async () => {
    const report = zReport();
    (getClosedBusinessDay as jest.Mock).mockResolvedValue({
      ...report,
      summary: {
        ...report.summary,
        cashReconciliation: {
          cashPayable: '55.70',
          cashReceived: '50.00',
          changeGiven: '0.00',
          checked: true,
          reconciled: false,
          legacy: false,
        },
      },
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Reconciled: No');
  });

  it('prints reconciliation blockers without failing the PDF', async () => {
    const report = zReport();
    (getClosedBusinessDay as jest.Mock).mockResolvedValue({
      ...report,
      summary: {
        ...report.summary,
        blockers: [
          {
            type: 'Z_DISCOUNT_SPLIT_MISMATCH',
            count: 1,
            label: 'Discount split does not match the discount total',
            amount: '15.00',
          },
        ],
      },
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Blockers');
    expect(lines).toContain(
      'Discount split does not match the discount total (1) — MYR 15.00'
    );
    expect(lines).not.toContain('None');
  });

  it('prints an em dash for a legacy snapshot without the new fields', async () => {
    const report = zReport();
    const summary = { ...report.summary };
    delete (summary as { discountBySource?: unknown }).discountBySource;
    delete (summary as { rewardTotal?: unknown }).rewardTotal;
    delete (summary as { refundsPriorPeriod?: unknown }).refundsPriorPeriod;
    (getClosedBusinessDay as jest.Mock).mockResolvedValue({
      ...report,
      summary,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/counter/business-day/close/day-1/pdf'
      ),
      { params: Promise.resolve({ id: 'day-1' }) }
    );

    expect(response.status).toBe(200);
    const lines = mockText.mock.calls.map(([line]) => line);
    expect(lines).toContain('Promotion discounts: —');
    expect(lines).toContain('Reward total: —');
    expect(lines).toContain('Prior-period refunds: —');
  });
});
