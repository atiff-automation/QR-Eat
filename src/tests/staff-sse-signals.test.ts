import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventPersistenceService } from '@/lib/event-persistence';
import {
  PG_EVENTS,
  pgPubSub,
  PostgresEventManager,
  staffSseEventTypeForChannel,
} from '@/lib/postgres-pubsub';
import { SSE_EVENT_TYPES } from '@/lib/constants/sse';
import { canReceiveRestaurantEvent } from '@/lib/counter/tenant-guards';

jest.mock('server-only', () => ({}));

jest.mock('@/lib/event-persistence', () => ({
  EventPersistenceService: { storeEvent: jest.fn().mockResolvedValue('evt-1') },
}));

jest.mock('@/lib/database', () => ({
  prisma: { pendingEvent: {} },
}));

const signal = {
  orderId: 'order-1',
  restaurantId: 'restaurant-1',
  orderNumber: 'ORD-1',
  orderVersion: 5,
  ticketCount: 2,
  timestamp: 1700000000000,
};

describe('staff SSE add-on/cancellation signals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(pgPubSub, 'notify').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps the new channels to additive SSE types', () => {
    expect(staffSseEventTypeForChannel(PG_EVENTS.ORDER_ITEMS_ADDED)).toBe(
      'order_items_added'
    );
    expect(staffSseEventTypeForChannel(PG_EVENTS.ORDER_CANCELLED)).toBe(
      'order_cancelled'
    );
    expect(SSE_EVENT_TYPES.ORDER_ITEMS_ADDED).toBe('order_items_added');
    expect(SSE_EVENT_TYPES.ORDER_CANCELLED).toBe('order_cancelled');
    expect(staffSseEventTypeForChannel('not_a_channel')).toBeNull();
  });

  it('dual-writes the add-on signal with a tenant-safe payload', async () => {
    await PostgresEventManager.publishOrderItemsAdded(signal);

    expect(EventPersistenceService.storeEvent).toHaveBeenCalledWith({
      eventType: 'order_items_added',
      eventData: signal,
      restaurantId: 'restaurant-1',
    });
    expect(pgPubSub.notify).toHaveBeenCalledWith('order_items_added', signal);

    const payload = (pgPubSub.notify as jest.Mock).mock.calls[0][1];
    expect(payload).toMatchObject({
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
      orderVersion: 5,
      ticketCount: 2,
    });
    expect(payload).not.toHaveProperty('reason');
    expect(payload).not.toHaveProperty('items');
    expect(payload).not.toHaveProperty('customerName');
    expect(payload).not.toHaveProperty('customerPhone');
  });

  it('dual-writes the cancellation signal', async () => {
    await PostgresEventManager.publishOrderCancelled(signal);

    expect(EventPersistenceService.storeEvent).toHaveBeenCalledWith({
      eventType: 'order_cancelled',
      eventData: signal,
      restaurantId: 'restaurant-1',
    });
    expect(pgPubSub.notify).toHaveBeenCalledWith('order_cancelled', signal);
  });

  it('keeps the tenant filter fail-closed', () => {
    expect(canReceiveRestaurantEvent('restaurant-1', 'restaurant-2')).toBe(
      false
    );
    expect(canReceiveRestaurantEvent(undefined, 'restaurant-1')).toBe(false);
    expect(canReceiveRestaurantEvent('restaurant-1', undefined)).toBe(false);
    expect(canReceiveRestaurantEvent('restaurant-1', 'restaurant-1')).toBe(
      true
    );
  });

  it('keeps one staff stream with no id cursor', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/api/events/orders/route.ts'),
      'utf8'
    );

    expect(source.match(/new ReadableStream/g)).toHaveLength(1);
    expect(source).toContain('PG_EVENTS.ORDER_ITEMS_ADDED');
    expect(source).toContain('PG_EVENTS.ORDER_CANCELLED');
    expect(source).toContain('canReceiveRestaurantEvent');
    // Frames are data-only; B3 adds no `id:` resume cursor.
    expect(source).not.toMatch(/\bid:\s/);
  });
});
