import { prisma } from '@/lib/database';
import {
  NONE_PRINT_ERROR,
  recordOrderCreated,
  recordOrderItemsAdded,
  recordOrderStatusChanged,
  resolveItemRoute,
} from '@/lib/order-events';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    orderEvent: { findMany: jest.fn(), createMany: jest.fn() },
    station: { findMany: jest.fn() },
    stationCategory: { findMany: jest.fn() },
  },
}));

const baseOrder = {
  id: 'order-1',
  restaurantId: 'restaurant-1',
  orderNumber: 'ORD-1',
  counterReference: null,
  dailySeq: 12,
  clientOrderId: null,
  orderType: 'DINE_IN',
  customerName: null,
  status: 'CONFIRMED',
  version: 2,
  specialInstructions: null,
  table: { tableNumber: '7', tableName: null },
  items: [
    {
      id: 'item-1',
      quantity: 1,
      totalAmount: 19.99,
      specialInstructions: null,
      menuItem: { name: 'Penne Arrabbiata', categoryId: 'cat-1' },
      selectedOptions: [],
    },
  ],
};

function stationSettings(printMode: string) {
  return {
    warnMinutes: 5,
    lateMinutes: 10,
    density: 'normal',
    textScale: 'normal',
    printMode,
  };
}

function lastCreateManyData() {
  return (prisma.orderEvent.createMany as jest.Mock).mock.calls.at(-1)[0].data;
}

describe('resolveItemRoute (shared routing rule)', () => {
  const routing = {
    byCategory: new Map([['cat-mapped', 'station-mapped']]),
    defaultStationId: 'station-default',
  };

  it('uses the category mapping when present', () => {
    expect(resolveItemRoute(routing, 'cat-mapped')).toEqual({
      stationId: 'station-mapped',
      mapped: true,
    });
  });

  it('falls back to the default station and marks the item as fallback', () => {
    expect(resolveItemRoute(routing, 'cat-unmapped')).toEqual({
      stationId: 'station-default',
      mapped: false,
    });
  });

  it('returns no station when there is neither a mapping nor a default', () => {
    expect(
      resolveItemRoute(
        { byCategory: new Map(), defaultStationId: null },
        'cat-unmapped'
      )
    ).toEqual({ stationId: null, mapped: false });
  });
});

describe('printable event payload stamping and initial status (§4.3, §5.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(baseOrder);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orderEvent.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.stationCategory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'station-1',
        isDefault: true,
        settings: stationSettings('STATION'),
      },
    ]);
  });

  it('stamps STATION on order.created and starts PENDING', async () => {
    await recordOrderCreated('order-1');

    const row = lastCreateManyData()[0];
    expect(row.payload).toMatchObject({ printMode: 'STATION' });
    expect(row.printStatus).toBe('PENDING');
    expect(row).not.toHaveProperty('printError');
  });

  it('stamps COUNTER on order.created and starts PENDING', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'station-1',
        isDefault: true,
        settings: stationSettings('COUNTER'),
      },
    ]);

    await recordOrderCreated('order-1');

    const row = lastCreateManyData()[0];
    expect(row.payload).toMatchObject({ printMode: 'COUNTER' });
    expect(row.printStatus).toBe('PENDING');
  });

  it('creates NONE tickets already SKIPPED with no attempt or device', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 'station-1', isDefault: true, settings: stationSettings('NONE') },
    ]);

    await recordOrderCreated('order-1');

    const row = lastCreateManyData()[0];
    expect(row.payload).toMatchObject({ printMode: 'NONE' });
    expect(row.printStatus).toBe('SKIPPED');
    expect(row.printError).toBe(NONE_PRINT_ERROR);
    expect(row).not.toHaveProperty('printAttemptedAt');
    expect(row).not.toHaveProperty('printedAt');
    expect(row).not.toHaveProperty('printDeviceId');
  });

  it('stamps add-on tickets and starts PENDING on COUNTER', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'station-1',
        isDefault: true,
        settings: stationSettings('COUNTER'),
      },
    ]);

    await recordOrderItemsAdded('order-1', ['item-1']);

    const row = lastCreateManyData()[0];
    expect(row.type).toBe('order.items.added');
    expect(row.payload).toMatchObject({
      printMode: 'COUNTER',
      addedItemIds: ['item-1'],
    });
    expect(row.printStatus).toBe('PENDING');
  });

  it('is idempotent when creation events already exist', async () => {
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1' },
    ]);

    const result = await recordOrderCreated('order-1');

    expect(result.replayed).toBe(true);
    expect(prisma.orderEvent.createMany).not.toHaveBeenCalled();
    expect(prisma.station.findMany).not.toHaveBeenCalled();
  });
});

describe('cancellation chits (§5.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(baseOrder);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1' },
    ]);
    (prisma.orderEvent.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('starts a STATION cancellation PENDING with a stamped mode', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 'station-1', settings: stationSettings('STATION') },
    ]);

    await recordOrderStatusChanged('order-1', 'CONFIRMED', 'CANCELLED');

    const row = lastCreateManyData()[0];
    expect(row.type).toBe('order.cancelled');
    expect(row.payload).toMatchObject({ printMode: 'STATION' });
    expect(row.printStatus).toBe('PENDING');
  });

  it('starts a COUNTER cancellation SKIPPED (until O-3)', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 'station-1', settings: stationSettings('COUNTER') },
    ]);

    await recordOrderStatusChanged('order-1', 'CONFIRMED', 'CANCELLED');

    const row = lastCreateManyData()[0];
    expect(row.payload).toMatchObject({ printMode: 'COUNTER' });
    expect(row.printStatus).toBe('SKIPPED');
  });

  it('starts a NONE cancellation SKIPPED with the KDS reason', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 'station-1', settings: stationSettings('NONE') },
    ]);

    await recordOrderStatusChanged('order-1', 'CONFIRMED', 'CANCELLED');

    const row = lastCreateManyData()[0];
    expect(row.payload).toMatchObject({ printMode: 'NONE' });
    expect(row.printStatus).toBe('SKIPPED');
    expect(row.printError).toBe(NONE_PRINT_ERROR);
  });

  it('leaves non-ticket events unstamped and printStatus null', async () => {
    await recordOrderStatusChanged('order-1', 'PREPARING', 'READY');

    const row = lastCreateManyData()[0];
    expect(row.type).toBe('order.status.changed');
    expect(row.payload).not.toHaveProperty('printMode');
    expect(row).not.toHaveProperty('printStatus');
    expect(prisma.station.findMany).not.toHaveBeenCalled();
  });
});
