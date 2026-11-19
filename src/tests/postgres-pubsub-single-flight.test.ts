import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * Every `new Client()` call is recorded so the tests can assert exactly how
 * many LISTEN/NOTIFY clients exist and what was `LISTEN`ed on each one.
 */
const mockCreatedClients: MockClient[] = [];
const mockControl = {
  /** Reject the next `LISTEN` query once (simulates an unusable session). */
  failNextListen: false,
  /** Reject these exact `LISTEN` statements once each (mid-pass failure). */
  failListenSql: new Set<string>(),
  /** Hold these exact queries until the test resolves the deferred. */
  listenGates: new Map<string, Promise<void>>(),
  /** Hold a client's `connect()` by creation index (0 = LISTEN, 1 = NOTIFY). */
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
      query: jest.fn(async (sql: string) => {
        const gate = mockControl.listenGates.get(sql);
        if (gate) {
          mockControl.listenGates.delete(sql);
          await gate;
        }
        if (mockControl.failListenSql.has(sql)) {
          mockControl.failListenSql.delete(sql);
          throw new Error('connection terminated');
        }
        if (sql.startsWith('LISTEN') && mockControl.failNextListen) {
          mockControl.failNextListen = false;
          throw new Error('connection terminated');
        }
        return undefined;
      }),
      end: jest.fn().mockResolvedValue(undefined),
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const listenIssued = (client: MockClient | undefined, sql: string): boolean =>
  Boolean(
    client &&
      client.query.mock.calls.some(([called]) => (called as string) === sql)
  );

const subscriptionState = (): {
  channels: string[];
  isListening: boolean;
} => {
  const state = pgPubSub as unknown as {
    subscribedChannels: Set<string>;
    isListening: boolean;
  };
  return {
    channels: [...state.subscribedChannels],
    isListening: state.isListening,
  };
};

const createdClients = (): MockClient[] => mockCreatedClients;

const listenQueries = (client: MockClient): string[] =>
  client.query.mock.calls
    .map(([sql]) => sql as string)
    .filter((sql) => sql.startsWith('LISTEN '));

const allListenQueries = (): string[] =>
  mockCreatedClients.flatMap((client) => listenQueries(client));

const clientsWithNotificationHandler = (): MockClient[] =>
  mockCreatedClients.filter(
    (client) => (client.handlers.get('notification')?.length ?? 0) > 0
  );

const setReconnectAttempts = (value: number): void => {
  // Test-only control of the private retry budget so the give-up branch can be
  // exercised without waiting through five real 5s reconnect delays.
  (pgPubSub as unknown as { reconnectAttempts: number }).reconnectAttempts =
    value;
};

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

describe('PostgreSQL pub/sub listener single-flight', () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    await pgPubSub.cleanup();
    mockCreatedClients.length = 0;
    mockControl.failNextListen = false;
    mockControl.failListenSql.clear();
    mockControl.listenGates.clear();
    mockControl.connectGates.clear();
    (Client as unknown as jest.Mock).mockClear();
    setReconnectAttempts(0);
  });

  afterEach(async () => {
    await pgPubSub.cleanup();
  });

  it('shares one LISTEN client between concurrent cold subscribers', async () => {
    await Promise.all([
      pgPubSub.subscribe('channel_a', 'channel_b'),
      pgPubSub.subscribe('channel_a', 'channel_b'),
    ]);

    // One LISTEN client plus the separate NOTIFY client, not two listeners.
    expect(createdClients()).toHaveLength(2);
    const [listenClient] = createdClients();

    expect(listenQueries(listenClient)).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
    ]);
    expect(listenQueries(createdClients()[1])).toEqual([]);
    expect(listenClient.handlers.get('notification')).toHaveLength(1);
    expect(clientsWithNotificationHandler()).toHaveLength(1);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('shares one in-flight initialize() pass', async () => {
    await Promise.all([pgPubSub.initialize(), pgPubSub.initialize()]);

    expect(createdClients()).toHaveLength(2);

    // An initialize() after success is a no-op for the LISTEN client.
    await pgPubSub.initialize();
    expect(createdClients()).toHaveLength(2);
  });

  it('keeps channel coverage additive across differing channel sets', async () => {
    await pgPubSub.subscribe('channel_a', 'channel_b');
    await Promise.all([
      pgPubSub.subscribe('channel_a', 'channel_b', 'channel_c'),
      pgPubSub.subscribe('channel_a', 'channel_b', 'channel_c'),
    ]);

    expect(createdClients()).toHaveLength(2);
    expect(listenQueries(createdClients()[0])).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
      'LISTEN channel_c',
    ]);
  });

  it('covers the 5-channel instrumentation set plus the 10-channel route set', async () => {
    // src/instrumentation.ts subscribes these five at boot.
    await pgPubSub.subscribe(
      PG_EVENTS.ORDER_STATUS_CHANGED,
      PG_EVENTS.ORDER_CREATED,
      PG_EVENTS.ORDER_ITEM_STATUS_CHANGED,
      PG_EVENTS.KITCHEN_NOTIFICATION,
      PG_EVENTS.RESTAURANT_NOTIFICATION
    );

    // src/app/api/events/orders/route.ts subscribes these ten per connection.
    await pgPubSub.subscribe(
      PG_EVENTS.ORDER_STATUS_CHANGED,
      PG_EVENTS.ORDER_CREATED,
      PG_EVENTS.ORDER_ITEMS_ADDED,
      PG_EVENTS.ORDER_CANCELLED,
      PG_EVENTS.ORDER_ITEM_STATUS_CHANGED,
      PG_EVENTS.ORDER_RECALLED,
      PG_EVENTS.ORDER_RECALL_CLEARED,
      PG_EVENTS.KITCHEN_NOTIFICATION,
      PG_EVENTS.RESTAURANT_NOTIFICATION,
      PG_EVENTS.TABLE_STATUS_CHANGED
    );

    const issued = allListenQueries();
    expect(issued).toHaveLength(10);
    expect(new Set(issued).size).toBe(10);
    // The B3 channels must not be dropped when instrumentation wins the race.
    expect(issued).toContain(`LISTEN ${PG_EVENTS.ORDER_ITEMS_ADDED}`);
    expect(issued).toContain(`LISTEN ${PG_EVENTS.ORDER_CANCELLED}`);
    expect(issued).toContain(`LISTEN ${PG_EVENTS.ORDER_RECALLED}`);
    expect(issued).toContain(`LISTEN ${PG_EVENTS.ORDER_RECALL_CLEARED}`);
    expect(issued).toContain(`LISTEN ${PG_EVENTS.TABLE_STATUS_CHANGED}`);
    expect(createdClients()).toHaveLength(2);
  });

  it('releases a client whose first LISTEN fails so a retry rebuilds', async () => {
    mockControl.failNextListen = true;

    await expect(pgPubSub.subscribe('channel_a')).rejects.toThrow(
      'connection terminated'
    );

    const failedClient = createdClients()[0];
    expect(failedClient.end).toHaveBeenCalledTimes(1);
    expect(pgPubSub.isConnected()).toBe(false);

    await pgPubSub.subscribe('channel_a');

    // A fresh LISTEN client was created and the channel was issued on it. The
    // NOTIFY client is independent and is reused.
    expect(createdClients()).toHaveLength(3);
    const retryClient = createdClients()[2];
    expect(retryClient).not.toBe(failedClient);
    expect(listenQueries(retryClient)).toEqual(['LISTEN channel_a']);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('emits one message per notification with one notification handler', async () => {
    await pgPubSub.subscribe('channel_a');

    const received: Array<[string, string]> = [];
    pgPubSub.on('message', (channel: string, message: string) => {
      received.push([channel, message]);
    });

    emitNotification(createdClients()[0], 'channel_a', {
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
    });

    expect(received).toHaveLength(1);
    expect(received[0][0]).toBe('channel_a');
    expect(JSON.parse(received[0][1])).toEqual({
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
    });
    expect(clientsWithNotificationHandler()).toHaveLength(1);
  });

  it('resets the session on cleanup so the next subscribe re-LISTENs', async () => {
    await pgPubSub.subscribe('channel_a', 'channel_b');
    const oldListenClient = createdClients()[0];
    const oldNotifyClient = createdClients()[1];

    await pgPubSub.cleanup();

    expect(oldListenClient.end).toHaveBeenCalledTimes(1);
    expect(oldNotifyClient.end).toHaveBeenCalledTimes(1);
    expect(pgPubSub.isConnected()).toBe(false);

    await pgPubSub.subscribe('channel_a');

    expect(createdClients()).toHaveLength(4);
    const newListenClient = createdClients()[2];
    expect(listenQueries(newListenClient)).toEqual(['LISTEN channel_a']);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('clears the channel set on disconnect and re-issues LISTEN', async () => {
    await pgPubSub.subscribe('channel_a', 'channel_b');
    const listenClient = createdClients()[0];

    runEndHandlers(listenClient);

    expect(pgPubSub.isConnected()).toBe(false);

    await pgPubSub.subscribe('channel_a');

    // Same live client, no second listener, but LISTEN is issued again.
    expect(createdClients()).toHaveLength(2);
    expect(listenQueries(listenClient)).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
      'LISTEN channel_a',
    ]);
    expect(clientsWithNotificationHandler()).toHaveLength(1);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('releases the dead client when the reconnect budget is exhausted', async () => {
    await pgPubSub.subscribe('channel_a');
    const deadClient = createdClients()[0];

    setReconnectAttempts(5);
    runEndHandlers(deadClient);

    expect(deadClient.end).toHaveBeenCalledTimes(1);
    expect(pgPubSub.isConnected()).toBe(false);

    await pgPubSub.subscribe('channel_a');

    expect(createdClients()).toHaveLength(3);
    const rebuiltClient = createdClients()[2];
    expect(rebuiltClient).not.toBe(deadClient);
    expect(listenQueries(rebuiltClient)).toEqual(['LISTEN channel_a']);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('subscribes the union when a larger set joins an in-flight smaller set', async () => {
    // Hold the first LISTEN so the smaller set is still in flight when the
    // larger set arrives. A first-caller-wins implementation drops channel_b
    // and channel_c here.
    const gate = defer();
    mockControl.listenGates.set('LISTEN channel_a', gate.promise);

    const small = pgPubSub.subscribe('channel_a');
    await waitFor(
      () => listenIssued(createdClients()[0], 'LISTEN channel_a'),
      'the first LISTEN to be issued'
    );

    const large = pgPubSub.subscribe('channel_a', 'channel_b', 'channel_c');
    gate.resolve();
    await Promise.all([small, large]);

    expect(createdClients()).toHaveLength(2);
    expect(listenQueries(createdClients()[0])).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
      'LISTEN channel_c',
    ]);
    expect(subscriptionState().channels.sort()).toEqual([
      'channel_a',
      'channel_b',
      'channel_c',
    ]);
  });

  it('does not keep bookkeeping from a session whose NOTIFY connect failed', async () => {
    // NOTIFY is the second client. Its connect stays pending until the test
    // rejects it; the LISTEN pass below is held so the old code can record the
    // channel after the failed pass cleared the session.
    const notifyConnect = defer<boolean>();
    mockControl.connectGates.set(1, () =>
      notifyConnect.promise.then((ok) => {
        if (!ok) throw new Error('notify connect failed');
      })
    );
    const listenGate = defer();
    mockControl.listenGates.set('LISTEN channel_a', listenGate.promise);

    const init = pgPubSub.initialize();
    await waitFor(
      () => mockCreatedClients.length === 2,
      'the NOTIFY client to be created'
    );
    const subscribePass = pgPubSub.subscribe('channel_a');
    await new Promise((resolve) => setImmediate(resolve));

    notifyConnect.resolve(false);
    await expect(init).rejects.toThrow('notify connect failed');
    listenGate.resolve();
    await subscribePass.catch(() => undefined);

    expect(pgPubSub.isConnected()).toBe(false);
    expect(subscriptionState()).toEqual({ channels: [], isListening: false });

    await pgPubSub.subscribe('channel_a');

    // The fresh session re-issues LISTEN instead of trusting stale bookkeeping.
    const freshListenClient = createdClients()[2];
    expect(listenQueries(freshListenClient)).toEqual(['LISTEN channel_a']);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('does not record channels when the session is closed mid-pass', async () => {
    await pgPubSub.subscribe('channel_x');
    const firstClient = createdClients()[0];

    const gate = defer();
    mockControl.listenGates.set('LISTEN channel_a', gate.promise);
    const pass = pgPubSub.subscribe('channel_a');
    await waitFor(
      () => listenIssued(firstClient, 'LISTEN channel_a'),
      'the LISTEN to be issued on the first session'
    );

    await pgPubSub.cleanup();
    gate.resolve();

    // The pass accepted a statement from a session that no longer exists, so it
    // must fail instead of writing bookkeeping into the next session.
    await expect(pass).rejects.toThrow(/session changed/);
    expect(subscriptionState()).toEqual({ channels: [], isListening: false });

    await pgPubSub.subscribe('channel_a');

    const freshListenClient = createdClients()[2];
    expect(listenQueries(freshListenClient)).toEqual(['LISTEN channel_a']);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('does not publish a session abandoned by cleanup during connect', async () => {
    const connectGate = defer();
    mockControl.connectGates.set(0, () => connectGate.promise);

    const stalePass = pgPubSub.initialize();
    await waitFor(
      () => mockCreatedClients.length === 1,
      'the stale LISTEN client to be created'
    );

    // Abandon the in-flight pass, then build a replacement session.
    await pgPubSub.cleanup();
    const livePass = pgPubSub.initialize();
    await waitFor(
      () => mockCreatedClients.length === 3,
      'the replacement session clients'
    );
    await pgPubSub.subscribe('channel_a');

    connectGate.resolve();

    await expect(stalePass).rejects.toThrow(/abandoned/);
    await livePass;

    const staleClient = createdClients()[0];
    const liveListenClient = createdClients()[1];
    const liveClientsWithHandler = clientsWithNotificationHandler().filter(
      (client) => client.end.mock.calls.length === 0
    );

    expect(staleClient.end).toHaveBeenCalledTimes(1);
    expect(liveClientsWithHandler).toEqual([liveListenClient]);
    expect(allListenQueries()).toEqual(['LISTEN channel_a']);
    expect(listenQueries(liveListenClient)).toEqual(['LISTEN channel_a']);

    const received: string[] = [];
    pgPubSub.on('message', (channel: string) => received.push(channel));
    emitNotification(liveListenClient, 'channel_a', { orderId: 'order-1' });

    expect(received).toEqual(['channel_a']);
    expect(liveListenClient.handlers.get('notification')).toHaveLength(1);
  });

  it('keeps the live session usable after a stale initialize pass rejects', async () => {
    const connectGate = defer();
    mockControl.connectGates.set(0, () => connectGate.promise);

    const stalePass = pgPubSub.initialize();
    await waitFor(
      () => mockCreatedClients.length === 1,
      'the stale LISTEN client to be created'
    );

    await pgPubSub.cleanup();
    await pgPubSub.initialize();
    await waitFor(
      () => mockCreatedClients.length === 3,
      'the replacement session clients'
    );

    connectGate.resolve();
    await expect(stalePass).rejects.toThrow(/abandoned/);

    await pgPubSub.subscribe('channel_b');

    // The live session is reused; no third LISTEN client is created.
    expect(createdClients()).toHaveLength(3);
    expect(listenQueries(createdClients()[1])).toEqual(['LISTEN channel_b']);
    expect(createdClients()[0].end).toHaveBeenCalledTimes(1);
    expect(pgPubSub.isConnected()).toBe(true);
  });

  it('retries only the remainder after a mid-pass LISTEN failure', async () => {
    mockControl.failListenSql.add('LISTEN channel_b');

    await expect(
      pgPubSub.subscribe('channel_a', 'channel_b', 'channel_c')
    ).rejects.toThrow('connection terminated');

    const listenClient = createdClients()[0];
    expect(listenQueries(listenClient)).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
    ]);
    expect(pgPubSub.isConnected()).toBe(true);

    await pgPubSub.subscribe('channel_a', 'channel_b', 'channel_c');

    // channel_a was already listened on this session: only b and c are retried.
    expect(listenQueries(listenClient)).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
      'LISTEN channel_b',
      'LISTEN channel_c',
    ]);
    expect(createdClients()).toHaveLength(2);
  });

  it('collapses duplicate channel arguments into one LISTEN', async () => {
    await pgPubSub.subscribe(
      'channel_a',
      'channel_a',
      'channel_b',
      'channel_a'
    );

    expect(listenQueries(createdClients()[0])).toEqual([
      'LISTEN channel_a',
      'LISTEN channel_b',
    ]);
    expect(subscriptionState().channels.sort()).toEqual([
      'channel_a',
      'channel_b',
    ]);
  });

  it('keeps the SSE route on the expected ten channels without a connected gate', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/api/events/orders/route.ts'),
      'utf8'
    );
    const start = source.indexOf('async function setupPostgresSubscription');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n}\n', start);
    const body = source.slice(start, end === -1 ? undefined : end);

    expect(body).not.toMatch(/pgPubSub\.isConnected\s*\(/);

    const call = body.match(/await pgPubSub\.subscribe\(([\s\S]*?)\);/);
    expect(call).not.toBeNull();
    const channels = Array.from(
      (call as RegExpMatchArray)[1].matchAll(/PG_EVENTS\.([A-Z_]+)/g)
    ).map((match) => match[1]);

    expect(channels).toEqual([
      'ORDER_STATUS_CHANGED',
      'ORDER_CREATED',
      'ORDER_ITEMS_ADDED',
      'ORDER_CANCELLED',
      'ORDER_ITEM_STATUS_CHANGED',
      'ORDER_RECALLED',
      'ORDER_RECALL_CLEARED',
      'KITCHEN_NOTIFICATION',
      'RESTAURANT_NOTIFICATION',
      'TABLE_STATUS_CHANGED',
    ]);
    expect(new Set(channels).size).toBe(10);
  });
});
