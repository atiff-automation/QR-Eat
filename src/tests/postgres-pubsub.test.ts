import { Client } from 'pg';
import { EVENT_CONFIG } from '@/lib/event-config';
import { pgPubSub } from '@/lib/postgres-pubsub';

jest.mock('server-only', () => ({}));

jest.mock('@/lib/database', () => ({
  prisma: {
    orderEvent: {},
  },
}));

type MockClient = {
  connect: jest.Mock;
  query: jest.Mock;
  end: jest.Mock;
  on: jest.Mock;
};

type MockState = { __mockPubSubClientIndex?: number };

jest.mock('pg', () => ({
  Client: jest.fn(() => {
    const state = globalThis as unknown as { __mockPubSubClientIndex?: number };
    const index = state.__mockPubSubClientIndex ?? 0;
    state.__mockPubSubClientIndex = index + 1;
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      query:
        index === 0
          ? jest
              .fn()
              .mockRejectedValue(
                new Error('Client has encountered a connection error')
              )
          : jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
  }),
}));

const createdClients = (): MockClient[] =>
  (Client as unknown as jest.Mock).mock.results.map(
    (result) => result.value as MockClient
  );

const mockState = globalThis as unknown as MockState;

describe('PostgreSQL pub/sub NOTIFY recovery', () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    mockState.__mockPubSubClientIndex = 0;
    (Client as unknown as jest.Mock).mockClear();
    (EVENT_CONFIG as { RETRY_BACKOFF_MS: number }).RETRY_BACKOFF_MS = 1;
    await pgPubSub.cleanup();
  });

  afterEach(async () => {
    await pgPubSub.cleanup();
  });

  it('replaces a failed NOTIFY client and publishes on retry', async () => {
    await pgPubSub.notify('order_status_changed', {
      orderId: 'order-1',
      timestamp: 1,
    });

    const clients = createdClients();
    expect(clients).toHaveLength(2);
    expect(clients[0].query).toHaveBeenCalledTimes(1);
    expect(clients[0].end).toHaveBeenCalled();
    expect(clients[1].query).toHaveBeenCalledTimes(1);
  });

  it('keeps a healthy NOTIFY client', async () => {
    mockState.__mockPubSubClientIndex = 1;

    await pgPubSub.notify('order_status_changed', {
      orderId: 'order-1',
      timestamp: 1,
    });

    const clients = createdClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].query).toHaveBeenCalledTimes(1);
  });
});
