export interface OrderDisplayInput {
  orderNumber: string;
  dailySeq?: number | null;
  orderType?: string | null;
  pickupNumber?: string | null;
  table?: {
    tableNumber: string;
    tableName?: string | null;
  } | null;
  customerName?: string | null;
  customerSession?: {
    customerName?: string | null;
  } | null;
}

export function getOrderPrimaryLabel(order: OrderDisplayInput): string {
  if (order.orderType === 'TAKEAWAY') {
    const pickup =
      order.pickupNumber ??
      (order.dailySeq ? `#${String(order.dailySeq).padStart(3, '0')}` : null);
    return pickup ? `TAKEAWAY ${pickup}` : 'TAKEAWAY';
  }
  if (order.table) {
    return `Table ${order.table.tableNumber}`;
  }
  return `Order ${order.orderNumber}`;
}

export function matchesOrderSearch(
  order: OrderDisplayInput,
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const values = [
    order.orderNumber,
    order.orderType === 'TAKEAWAY' ? 'takeaway' : 'dine-in',
    order.pickupNumber,
    order.dailySeq ? `#${String(order.dailySeq).padStart(3, '0')}` : null,
    order.table?.tableNumber,
    order.table?.tableName,
    order.customerName,
    order.customerSession?.customerName,
  ];

  return values.some(
    (value) =>
      typeof value === 'string' && value.toLowerCase().includes(normalized)
  );
}
