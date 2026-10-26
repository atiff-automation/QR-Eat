import type { PublicReceiptData } from '@/types/pos';
import { adaptPublicToDisplay } from '@/lib/utils/receipt-adapter';

function receipt(overrides: Partial<PublicReceiptData['order']> = {}) {
  return {
    receiptNumber: 'RCP-1',
    restaurant: {
      name: 'Test Restaurant',
      address: '1 Test Street',
      phone: '0123456789',
      email: 'test@example.test',
      taxLabel: 'Tax',
      serviceChargeLabel: 'Service Charge',
      currency: 'MYR',
    },
    order: {
      orderNumber: 'ORD-1',
      dailySeq: 42,
      orderType: 'TAKEAWAY',
      pickupNumber: '#042',
      customerName: 'Alex',
      tableNumber: null,
      tableName: null,
      tableLocation: undefined,
      items: [
        {
          name: 'Pasta',
          quantity: 1,
          unitPrice: 10,
          totalAmount: 10,
        },
      ],
      subtotalAmount: 10,
      taxAmount: 0.6,
      serviceCharge: 0,
      totalAmount: 10.6,
      createdAt: new Date('2026-10-27T12:00:00.000Z'),
      ...overrides,
    },
    payment: {
      method: 'cash',
      amount: 10.6,
      cashReceived: 20,
      changeGiven: 9.4,
      completedAt: new Date('2026-10-27T12:01:00.000Z'),
    },
    cashier: {
      firstName: 'Test',
      lastName: 'Cashier',
    },
  } satisfies PublicReceiptData;
}

describe('receipt adapter for takeaway', () => {
  it('uses the takeaway label and pickup number', () => {
    const display = adaptPublicToDisplay(receipt());

    expect(display.order.orderType).toBe('TAKEAWAY');
    expect(display.order.pickupNumber).toBe('#042');
    expect(display.order.customerName).toBe('Alex');
    expect(display.order.fulfillmentLabel).toBe('TAKEAWAY #042');
    expect(display.order.tableLocation).toBeUndefined();
  });

  it('keeps the table label for dine-in receipts', () => {
    const display = adaptPublicToDisplay(
      receipt({
        orderType: 'DINE_IN',
        pickupNumber: null,
        customerName: null,
        tableNumber: '2',
        tableName: 'Center Table',
      })
    );

    expect(display.order.orderType).toBe('DINE_IN');
    expect(display.order.fulfillmentLabel).toBe('2 - Center Table');
    expect(display.order.pickupNumber).toBeUndefined();
  });
});
