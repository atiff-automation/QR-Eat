import {
  getOrderPrimaryLabel,
  matchesOrderSearch,
} from '@/lib/utils/order-display';

const takeaway = {
  orderNumber: 'ORD-TAKEAWAY-1',
  orderType: 'TAKEAWAY',
  pickupNumber: '#042',
  table: null,
  customerName: 'Alex',
  customerSession: null,
};

const dineIn = {
  orderNumber: 'ORD-DINE-IN-1',
  orderType: 'DINE_IN',
  pickupNumber: '#043',
  table: { tableNumber: '2', tableName: 'Center Table' },
  customerName: null,
  customerSession: { customerName: 'Sam' },
};

describe('order display', () => {
  it('labels a takeaway order with its pickup number', () => {
    expect(getOrderPrimaryLabel(takeaway)).toBe('TAKEAWAY #042');
  });

  it('derives the pickup label from dailySeq when pickupNumber is absent', () => {
    expect(
      getOrderPrimaryLabel({ ...takeaway, pickupNumber: null, dailySeq: 42 })
    ).toBe('TAKEAWAY #042');
  });

  it('labels a dine-in order with its table', () => {
    expect(getOrderPrimaryLabel(dineIn)).toBe('Table 2');
  });

  it('searches takeaway by pickup number and customer', () => {
    expect(matchesOrderSearch(takeaway, '#042')).toBe(true);
    expect(matchesOrderSearch(takeaway, 'alex')).toBe(true);
    expect(matchesOrderSearch(takeaway, 'takeaway')).toBe(true);
  });

  it('searches dine-in by table and customer session', () => {
    expect(matchesOrderSearch(dineIn, '2')).toBe(true);
    expect(matchesOrderSearch(dineIn, 'center')).toBe(true);
    expect(matchesOrderSearch(dineIn, 'sam')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesOrderSearch(takeaway, 'zzz')).toBe(false);
  });
});
