import { Client } from 'pg';
import { PG_EVENTS, pgPubSub } from '@/lib/postgres-pubsub';

jest.mock('server-only', () => ({}));

jest.mock('@/lib/database', () => ({
  prisma: {
    pendingEvent: {},
  },
}));

type Handler = (...args: unknown[]) => void;

interface MockClient {
  connect: jest.Mock;
  query: jest.Mock;
  end: jest.Mock;
  on: jest.Mock;
  handlers: Map<string, Handler[]>;
}

/**
 * Every `new Client()` is recorded, like the AME-015 harness. `end()` runs the
 * registered `end` handlers, which is what the real `pg` client does: that is
 * the behaviour that lets a deliberate close re-enter `handleDisconnect()`.
 */
const mockCreatedClients: MockClient[] = [];
const mockControl = {
  /** Hold a client's `connect()` by creation index (0 = first client). */
  connectGates: new Map<number, () => Promise<void>>(),
};

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => {
    const handlers = new Map<string, Handler[]>();
    const index = mockCreatedClients.length;
    const client: MockClient = {
      handlers,
      connect: jest.fn(() => {
        const gate = mockControl.connectGates.get(index);
        if (gate) {
          mockControl.connectGates.delete(index);
          return gate();
        }
        return Promise.resolve(undefined);
      }),
      query: jest.fn().mockResolvedValue(undefined),
      end: jest.fn(async () => {
        for (const handler of handlers.get('end') ?? []) {
          handler();
        }
      }),
      on: jest.fn((event: string, handler: Handler) => {
        const existing = handlers.get(event) ?? [];
        existing.push(handler);
        handlers.set(event, existing);
        return client;
      }),
    };
    mockCreatedClients.push(client);
    return client;
  }),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

const defer = <T = void>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Let queued microtasks and immediates run until `predicate` is true. */
const waitFor = async (
  predicate: () => boolean,
  label: string
): Promise<void> => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const createdClients = (): MockClient[] => mockCreatedClients;

const listenQueries = (client: MockClient): string[] =>
  client.query.mock.calls
    .map(([sql]) => sql as string)
    .filter((sql) => sql.startsWith('LISTEN '));

const emitNotification = (
  client: MockClient,
  channel: string,
  payload: Record<string, unknown>
): void => {
  for (const handler of client.handlers.get('notification') ?? []) {
    handler({ channel, payload: JSON.stringify(payload) });
  }
};

const runEndHandlers = (client: MockClient): void => {
  for (const handler of client.handlers.get('end') ?? []) {
    handler();
  }
};

const setReconnectAttempts = (value: number): void => {
  (pgPubSub as unknown as { reconnectAttempts: number }).reconnectAttempts =
    value;
};

const softTeardown = (): Promise<void> =>
  (
    pgPubSub as unknown as { teardownSession(): Promise<void> }
  ).teardownSession();

const notifyClientRef = (): MockClient | null =>
  (pgPubSub as unknown as { notifyClient: MockClient | null }).notifyClient;

const advance = async (ms: number): Promise<void> => {
  await jest.advanceTimersByTimeAsync(ms);
};

describe('PostgreSQL pub/sub reconnect lifecycle', () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    jest.useRealTimers();
    await pgPubSub.cleanup();
    mockCreatedClients.length = 0;
    mockControl.connectGates.clear();
    (Client as unknown as jest.Mock).mockClear();
    setReconnectAttempts(0);
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  });

  afterEach(async () => {
    await pgPubSub.cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps a subscriber registered before a forced reconnect and delivers after it', async () => {
    await pgPubSub.subscribe('channel_a');
    const firstListenClient = createdClients()[0];
    expect(pgPubSub.isConnected()).toBe(true);

    const received: Array<[string, string]> = [];
    pgPubSub.on('message', (channel: string, message: string) => {
      received.push([channel, message]);
    });

    // Simulate the real client ending unexpectedly.
    runEndHandlers(firstListenClient);
    await advance(5000);

    await waitFor(
      () => createdClients().length === 4 && pgPubSub.isConnected(),
      'the reconnect to publish a replacement session'
    );

    const newListenClient = createdClients()[2];
    const expectedChannels = Object.values(PG_EVENTS);
    expect(listenQueries(newListenClient)).toHaveLength(
      expectedChannels.length
    );
    expect(newListenClient.handlers.get('notification')).toHaveLength(1);

    emitNotification(newListenClient, PG_EVENTS.ORDER_CREATED, {
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
    });

    // The pre-fix code removes this listener during reconnect and delivers zero.
    expect(received).toHaveLength(1);
    expect(received[0][0]).toBe(PG_EVENTS.ORDER_CREATED);
    expect(JSON.parse(received[0][1])).toEqual({
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
    });
  });

  it('emits exactly one message per notification after a reconnect', async () => {
    await pgPubSub.subscribe('channel_a');
    const received: string[] = [];
    pgPubSub.on('message', (channel: string) => received.push(channel));

    runEndHandlers(createdClients()[0]);
    await advance(5000);
    await waitFor(
      () => createdClients().length === 4 && pgPubSub.isConnected(),
      'the reconnect to publish a replacement session'
    );

    const newListenClient = createdClients()[2];
    expect(pgPubSub.listenerCount('message')).toBe(1);
    expect(newListenClient.handlers.get('notification')).toHaveLength(1);

    emitNotification(newListenClient, 'channel_a', { orderId: 'order-1' });

    expect(received).toEqual(['channel_a']);
  });

  it('runs exactly one reconnect cycle for one forced disconnect', async () => {
    await pgPubSub.subscribe('channel_a');
    expect(createdClients()).toHaveLength(2);
    const initialize = jest.spyOn(pgPubSub, 'initialize');

    runEndHandlers(createdClients()[0]);
    await advance(5000);
    await waitFor(
      () => createdClients().length === 4 && pgPubSub.isConnected(),
      'the first reconnect cycle'
    );

    // One teardown, one initialize, one subscribe pass.
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(createdClients()).toHaveLength(4);

    // No second attempt may appear after another delay window. Pre-fix, the
    // client's own `end` re-enters handleDisconnect and schedules one.
    await advance(5000);
    await new Promise((resolve) => setImmediate(resolve));

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(createdClients()).toHaveLength(4);
    expect(pgPubSub.isConnected()).toBe(true);

    initialize.mockRestore();
  });

  it('preserves listeners on session teardown and removes them on full disposal', async () => {
    await pgPubSub.subscribe('channel_a');
    const listener = jest.fn();
    pgPubSub.on('message', listener);

    // Soft teardown: connections and session state go, subscribers stay.
    await softTeardown();

    expect(pgPubSub.isConnected()).toBe(false);
    expect(pgPubSub.listenerCount('message')).toBe(1);

    await pgPubSub.subscribe('channel_b');
    const rebuiltClient = createdClients()[2];
    emitNotification(rebuiltClient, 'channel_b', { orderId: 'order-2' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(pgPubSub.isConnected()).toBe(true);

    // Full disposal keeps its old contract: everything is removed.
    await pgPubSub.cleanup();
    expect(pgPubSub.listenerCount('message')).toBe(0);

    await pgPubSub.subscribe('channel_c');
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('releases the client when the reconnect budget is exhausted', async () => {
    await pgPubSub.subscribe('channel_a');
    const deadClient = createdClients()[0];

    setReconnectAttempts(5);
    runEndHandlers(deadClient);

    expect(deadClient.end).toHaveBeenCalledTimes(1);
    expect(pgPubSub.isConnected()).toBe(false);

    await pgPubSub.subscribe('channel_a');
    const rebuiltClient = createdClients()[2];
    expect(rebuiltClient).not.toBe(deadClient);
    expect(listenQueries(rebuiltClient)).toEqual(['LISTEN channel_a']);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('does not adopt a NOTIFY client superseded by teardown', async () => {
    const gate = defer();
    mockControl.connectGates.set(0, () => gate.promise);

    const firstNotify = pgPubSub.notify('channel_a', { orderId: 'order-1' });
    await waitFor(
      () => createdClients().length === 1,
      'the first NOTIFY client to be created'
    );

    // Teardown while the NOTIFY connect is still in flight.
    await softTeardown();

    // The replacement publishes on a live client before the abandoned connect
    // resolves.
    const replacementNotify = pgPubSub.notify('channel_a', {
      orderId: 'order-2',
    });
    await waitFor(
      () => createdClients().length === 2 && notifyClientRef() !== null,
      'the replacement NOTIFY client to be published'
    );
    await replacementNotify;

    const liveNotifyClient = createdClients()[1];
    expect(liveNotifyClient.query).toHaveBeenCalled();
    expect(notifyClientRef()).toBe(liveNotifyClient);

    gate.resolve();
    // The abandoned connect must not hang the first publish.
    await firstNotify;

    const abandonedClient = createdClients()[0];
    expect(abandonedClient.end).toHaveBeenCalledTimes(1);
    // The live replacement is still the published client.
    expect(notifyClientRef()).toBe(liveNotifyClient);
    expect(liveNotifyClient.end).not.toHaveBeenCalled();
  });
});
