import { prisma } from '@/lib/database';
import { resolveRouting } from '@/lib/order-events';
import { resolveOrderPrintAuthority } from '@/lib/services/order-dispatch-service';

jest.mock('@/lib/database', () => ({
  prisma: {
    orderEvent: { findMany: jest.fn() },
    station: { findMany: jest.fn() },
    order: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/order-events', () => {
  const actual = jest.requireActual('@/lib/order-events');
  return { ...actual, resolveRouting: jest.fn() };
});

const orderId = '550e8400-e29b-41d4-a716-446655440010';
const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

function settings(printMode: string) {
  return {
    warnMinutes: 5,
    lateMinutes: 10,
    density: 'normal',
    textScale: 'normal',
    printMode,
  };
}

describe('resolveOrderPrintAuthority (§9.1, C-8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({ items: [] });
  });

  it('uses stamped COUNTER even when the live station setting is STATION', async () => {
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 's1', payload: { printMode: 'COUNTER' } },
    ]);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', settings: settings('STATION') },
    ]);

    const result = await resolveOrderPrintAuthority(orderId, restaurantId);

    expect(result).toEqual({
      routedStationIds: ['s1'],
      printAuthority: 'COUNTER',
      hasStationTicket: false,
      noKitchenDevice: true,
      resolvedFrom: 'events',
    });
    // A stamped ticket is authoritative; routing is not consulted.
    expect(resolveRouting).not.toHaveBeenCalled();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('keeps a stamped STATION ticket under Kitchen authority', async () => {
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 's1', payload: { printMode: 'STATION' } },
    ]);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', settings: settings('COUNTER') },
    ]);

    const result = await resolveOrderPrintAuthority(orderId, restaurantId);

    expect(result).toEqual({
      routedStationIds: ['s1'],
      printAuthority: 'STATION',
      hasStationTicket: true,
      noKitchenDevice: false,
      resolvedFrom: 'events',
    });
  });

  it('falls back to the live setting for a legacy event with no stamp', async () => {
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 's1', payload: { orderNumber: 'ORD-1' } },
    ]);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', settings: settings('NONE') },
    ]);

    const result = await resolveOrderPrintAuthority(orderId, restaurantId);

    expect(result.printAuthority).toBe('NONE');
    expect(result.noKitchenDevice).toBe(true);
    expect(result.resolvedFrom).toBe('events');
  });

  it('uses routing and current settings when the order has no events yet', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      items: [
        { menuItem: { categoryId: 'cat-1' } },
        { menuItem: { categoryId: 'cat-1' } },
      ],
    });
    (resolveRouting as jest.Mock).mockResolvedValue({
      byCategory: new Map([['cat-1', 's2']]),
      defaultStationId: 's3',
      stationIds: new Set(['s2', 's3']),
      printModes: new Map([
        ['s2', 'NONE'],
        ['s3', 'COUNTER'],
      ]),
    });

    const result = await resolveOrderPrintAuthority(orderId, restaurantId);

    expect(result).toEqual({
      routedStationIds: ['s2'],
      printAuthority: 'NONE',
      hasStationTicket: false,
      noKitchenDevice: true,
      resolvedFrom: 'routing',
    });
  });

  it('reports an unrouted order as not no-Kitchen', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue({
      items: [{ menuItem: { categoryId: 'cat-unmapped' } }],
    });
    (resolveRouting as jest.Mock).mockResolvedValue({
      byCategory: new Map(),
      defaultStationId: null,
      stationIds: new Set(),
      printModes: new Map(),
    });

    const result = await resolveOrderPrintAuthority(orderId, restaurantId);

    expect(result).toEqual({
      routedStationIds: [],
      printAuthority: null,
      hasStationTicket: false,
      noKitchenDevice: false,
      resolvedFrom: 'routing',
    });
  });
});
