import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { GET as getReceipt } from '@/app/api/receipt/[restaurantId]/[receiptNumber]/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    payment: { findMany: jest.fn() },
  },
}));

describe('takeaway receipt API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a takeaway receipt without a table', async () => {
    (prisma.payment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'payment-1',
        paymentMethod: 'cash',
        cashReceived: 20,
        changeGiven: 9.4,
        completedAt: new Date('2026-10-27T12:01:00.000Z'),
        processedByStaff: { firstName: 'Test', lastName: 'Cashier' },
        processedByOwner: null,
        processedByAdmin: null,
        order: {
          restaurantId: 'restaurant-1',
          orderNumber: 'ORD-TAKEAWAY-1',
          dailySeq: 42,
          orderType: 'TAKEAWAY',
          customerName: 'Alex',
          customerPhone: null,
          table: null,
          items: [],
          subtotalAmount: 10,
          taxAmount: 0.6,
          serviceCharge: 0,
          totalAmount: 10.6,
          createdAt: new Date('2026-10-27T12:00:00.000Z'),
          restaurant: {
            name: 'Test Restaurant',
            address: '1 Test Street',
            phone: '0123456789',
            email: 'test@example.test',
            taxLabel: 'Tax',
            serviceChargeLabel: 'Service Charge',
            currency: 'MYR',
          },
        },
      },
    ]);

    const response = await getReceipt(
      new NextRequest('http://localhost/api/receipt/restaurant-1/RCP-ORDER-1'),
      {
        params: Promise.resolve({
          restaurantId: 'restaurant-1',
          receiptNumber: 'RCP-ORDER-1',
        }),
      }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.receipt.order).toMatchObject({
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      customerName: 'Alex',
      tableNumber: null,
      tableName: null,
    });
  });
});
