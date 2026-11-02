import {
  getOrderStatusDisplay,
  getOrderStatusLabel,
  getOrderTypeLabel,
  getTableStateLabel,
} from '@/lib/order-utils';
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from '@/lib/constants/payment';

describe('terminology labels', () => {
  it('uses one order vocabulary with contextual final states', () => {
    expect(getOrderStatusLabel('PENDING')).toBe('Pending');
    expect(getOrderStatusLabel('CONFIRMED')).toBe('Confirmed');
    expect(getOrderStatusLabel('PREPARING')).toBe('Preparing');
    expect(getOrderStatusLabel('READY')).toBe('Ready');
    expect(getOrderStatusLabel('READY', 'TAKEAWAY')).toBe('Ready for pickup');
    expect(getOrderStatusLabel('SERVED')).toBe('Served');
    expect(getOrderStatusLabel('SERVED', 'TAKEAWAY')).toBe('Picked up');
    expect(getOrderStatusLabel('CANCELLED')).toBe('Cancelled');
  });

  it('keeps the status badge contextual for takeaway orders', () => {
    expect(getOrderStatusDisplay('READY', 'TAKEAWAY').label).toBe(
      'Ready for pickup'
    );
    expect(getOrderStatusDisplay('SERVED', 'TAKEAWAY').label).toBe('Picked up');
    expect(getOrderStatusDisplay('SERVED', 'DINE_IN').label).toBe('Served');
  });

  it('does not hide an unknown order status', () => {
    expect(getOrderStatusLabel('ON_HOLD')).toBe('ON_HOLD');
  });

  it('uses published order type labels', () => {
    expect(getOrderTypeLabel('DINE_IN')).toBe('Dine-in');
    expect(getOrderTypeLabel('TAKEAWAY')).toBe('Takeaway');
  });

  it('uses published table state labels', () => {
    expect(getTableStateLabel('AVAILABLE')).toBe('Available');
    expect(getTableStateLabel('OCCUPIED')).toBe('Occupied');
    expect(getTableStateLabel('RESERVED')).toBe('Reserved');
    expect(getTableStateLabel('INACTIVE')).toBe('Inactive');
  });

  it('maps payment methods to E-Wallet spelling', () => {
    expect(getPaymentMethodLabel('cash')).toBe('Cash');
    expect(getPaymentMethodLabel('card')).toBe('Card');
    expect(getPaymentMethodLabel('ewallet')).toBe('E-Wallet');
    expect(getPaymentMethodLabel('EWALLET')).toBe('E-Wallet');
    expect(getPaymentMethodLabel(' ewallet ')).toBe('E-Wallet');
  });

  it('keeps an unknown payment method readable and handles empty values', () => {
    expect(getPaymentMethodLabel('voucher')).toBe('voucher');
    expect(getPaymentMethodLabel(null)).toBe('—');
    expect(getPaymentMethodLabel(undefined)).toBe('—');
    expect(getPaymentMethodLabel('   ')).toBe('—');
  });

  it('never shows Pending as a payment status', () => {
    expect(getPaymentStatusLabel('PENDING')).toBe('Unpaid');
    expect(getPaymentStatusLabel('PAID')).toBe('Paid');
    expect(getPaymentStatusLabel('REFUNDED')).toBe('Refunded');
    expect(getPaymentStatusLabel('FAILED')).toBe('Failed');
    expect(getPaymentStatusLabel(null)).toBe('—');
  });
});
