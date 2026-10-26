import { prisma } from '@/lib/database';
import {
  orderFulfillment,
  recordOrderCreated,
  recordOrderStatusChanged,
} from '@/lib/order-events';

jest.mock('@/lib/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    orderEvent: { findMany: jest.fn(), createMany: jest.fn() },
    station: { findMany: jest.fn() },
    stationCategory: { findMany: jest.fn() },
  },
}));

const takeawayOrder = {
  id: 'order-takeaway-1',
  restaurantId: 'restaurant-1',
  orderNumber: 'ORD-TAKEAWAY-1',
  dailySeq: 42,
  orderType: 'TAKEAWAY',
  customerName: 'Alex',
  status: 'PENDING',
  version: 1,
  specialInstructions: 'Call on arrival',
  table: null,
  items: [
    {
      id: 'item-1',
      quantity: 2,
      totalAmount: 20,
      specialInstructions: 'No onions',
      menuItem: { name: 'Pasta', categoryId: 'cat-1' },
      selectedOptions: [{ name: 'Large' }],
    },
  ],
};

const dineInOrder = {
  ...takeawayOrder,
  id: 'order-dine-in-1',
  orderNumber: 'ORD-DINE-IN-1',
  dailySeq: 43,
  orderType: 'DINE_IN',
  customerName: null,
  table: { tableNumber: '2', tableName: 'Center Table' },
};

describe('takeaway kitchen payloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.station.findMany as jest.Mock).mockResolvedValue([
      { id: 'station-1', isDefault: true },
    ]);
    (prisma.stationCategory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.orderEvent.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('builds a takeaway fulfillment label and pickup number', () => {
    expect(orderFulfillment(takeawayOrder)).toEqual({
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      customerName: 'Alex',
      fulfillmentLabel: 'TAKEAWAY #042',
    });
  });

  it('builds a dine-in fulfillment label', () => {
    expect(orderFulfillment(dineInOrder)).toEqual({
      orderType: 'DINE_IN',
      pickupNumber: '#043',
      customerName: null,
      fulfillmentLabel: 'Center Table',
    });
  });

  it('adds takeaway fields to the created ticket payload', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(takeawayOrder);

    await recordOrderCreated('order-takeaway-1');

    const payload = (prisma.orderEvent.createMany as jest.Mock).mock.calls[0][0]
      .data[0].payload;

    expect(payload).toMatchObject({
      orderNumber: 'ORD-TAKEAWAY-1',
      tableName: 'TAKEAWAY #042',
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      customerName: 'Alex',
      fulfillmentLabel: 'TAKEAWAY #042',
      orderNote: 'Call on arrival',
      stationSubtotal: '20.00',
      fallback: true,
    });
  });

  it('adds takeaway fields to a status payload', async () => {
    (prisma.order.findUnique as jest.Mock).mockResolvedValue(takeawayOrder);
    (prisma.orderEvent.findMany as jest.Mock).mockResolvedValue([
      { stationId: 'station-1' },
    ]);

    await recordOrderStatusChanged('order-takeaway-1', 'PREPARING', 'READY');

    const payload = (prisma.orderEvent.createMany as jest.Mock).mock.calls[0][0]
      .data[0].payload;

    expect(payload).toMatchObject({
      orderNumber: 'ORD-TAKEAWAY-1',
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      customerName: 'Alex',
      fulfillmentLabel: 'TAKEAWAY #042',
      from: 'PREPARING',
      to: 'READY',
    });
  });
});
