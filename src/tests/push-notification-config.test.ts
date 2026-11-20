/**
 * Push notification VAPID configuration tests.
 *
 * Proves the two directions required by QR-EAT-AME-019:
 * - no VAPID configuration: importing is safe and sends are logged no-ops with
 *   no web-push call, no Prisma query and no subscription deletion;
 * - valid configuration: web-push is configured once, lazily, and the send path
 *   (including 410 cleanup) behaves as before;
 * - invalid configuration: no crash, no send, no deletion, one log line.
 */

type PushNotificationService =
  (typeof import('@/lib/push-notification-service'))['pushNotificationService'];

const mockSetVapidDetails = jest.fn();
const mockSendNotification = jest.fn();

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

const mockPrisma = {
  pushSubscription: {
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('@/lib/database', () => ({
  prisma: mockPrisma,
}));

const VAPID_KEYS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;

const originalVapidEnv = {
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
};

function clearVapidEnv(): void {
  for (const key of VAPID_KEYS) {
    delete process.env[key];
  }
}

function setVapidEnv(
  publicKey: string,
  privateKey: string,
  subject: string
): void {
  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_SUBJECT = subject;
}

/**
 * Load a fresh service instance so the lazily cached configuration state is
 * per-test (the module caches "configured" for the life of a process).
 */
function loadService(): PushNotificationService {
  let service: PushNotificationService | undefined;

  jest.isolateModules(() => {
    const serviceModule = jest.requireActual<
      typeof import('@/lib/push-notification-service')
    >('@/lib/push-notification-service');
    service = serviceModule.pushNotificationService;
  });

  if (!service) {
    throw new Error('push notification service failed to load');
  }

  return service;
}

function generateTestVapidKeys(): { publicKey: string; privateKey: string } {
  const realWebPush = jest.requireActual<typeof import('web-push')>('web-push');
  return realWebPush.generateVAPIDKeys();
}

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  keys: {
    p256dh: 'test-p256dh-key',
    auth: 'test-auth-key',
  },
};

const payload = {
  title: 'New Order',
  body: 'Order #TEST-1 received',
};

beforeEach(() => {
  mockSetVapidDetails.mockReset();
  mockSendNotification.mockReset();
  mockPrisma.pushSubscription.findMany.mockReset();
  mockPrisma.pushSubscription.delete.mockReset();
  clearVapidEnv();
});

afterAll(() => {
  for (const key of VAPID_KEYS) {
    const value = originalVapidEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('import safety without VAPID configuration', () => {
  it('imports without throwing and does not configure web-push', () => {
    expect(() => loadService()).not.toThrow();
    expect(mockSetVapidDetails).not.toHaveBeenCalled();
  });
});

describe('unconfigured sends', () => {
  it('sendNotification returns false without web-push or Prisma access', async () => {
    const service = loadService();

    await expect(service.sendNotification(subscription, payload)).resolves.toBe(
      false
    );

    expect(mockSetVapidDetails).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('does not delete a subscription for an invalid endpoint while unconfigured', async () => {
    const service = loadService();
    const invalidSubscription = {
      ...subscription,
      endpoint: 'https://example.com/not-a-push-endpoint',
    };

    await expect(
      service.sendNotification(invalidSubscription, payload)
    ).resolves.toBe(false);

    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('logs a single warning across repeated sends', async () => {
    const service = loadService();

    await service.sendNotification(subscription, payload);
    await service.sendNotification(subscription, payload);

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('sendToRestaurant returns zeros and performs no query or write', async () => {
    const service = loadService();

    await expect(
      service.sendToRestaurant('restaurant-1', payload)
    ).resolves.toEqual({ sent: 0, failed: 0 });

    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('sendToUser returns zeros and performs no query or write', async () => {
    const service = loadService();

    await expect(
      service.sendToUser('user-1', 'staff', payload)
    ).resolves.toEqual({ sent: 0, failed: 0 });

    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

describe('configured sends', () => {
  it('configures web-push once, lazily, and sends', async () => {
    const keys = generateTestVapidKeys();
    setVapidEnv(keys.publicKey, keys.privateKey, 'mailto:test@example.com');
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    const service = loadService();
    expect(mockSetVapidDetails).not.toHaveBeenCalled();

    await expect(service.sendNotification(subscription, payload)).resolves.toBe(
      true
    );

    expect(mockSetVapidDetails).toHaveBeenCalledTimes(1);
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      keys.publicKey,
      keys.privateKey
    );
    expect(mockSendNotification).toHaveBeenCalledTimes(1);

    await expect(service.sendNotification(subscription, payload)).resolves.toBe(
      true
    );

    expect(mockSetVapidDetails).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it('removes the subscription on a 410 response', async () => {
    const keys = generateTestVapidKeys();
    setVapidEnv(keys.publicKey, keys.privateKey, 'mailto:test@example.com');
    mockSendNotification.mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410 })
    );

    const service = loadService();

    await expect(service.sendNotification(subscription, payload)).resolves.toBe(
      false
    );

    expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: subscription.endpoint },
    });
  });

  it('sendToRestaurant batches configured subscriptions', async () => {
    const keys = generateTestVapidKeys();
    setVapidEnv(keys.publicKey, keys.privateKey, 'mailto:test@example.com');
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { endpoint: subscription.endpoint, p256dh: 'p1', auth: 'a1' },
      {
        endpoint: 'https://web.push.apple.com/fcm/send/test-endpoint-2',
        p256dh: 'p2',
        auth: 'a2',
      },
    ]);

    const service = loadService();

    await expect(
      service.sendToRestaurant('restaurant-1', payload)
    ).resolves.toEqual({ sent: 2, failed: 0 });

    expect(mockPrisma.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { restaurantId: 'restaurant-1' },
    });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });
});

describe('invalid VAPID configuration', () => {
  beforeEach(() => {
    // Let the mocked setter perform web-push's real validation so malformed
    // keys and subjects throw exactly as they do in production.
    const realWebPush =
      jest.requireActual<typeof import('web-push')>('web-push');
    mockSetVapidDetails.mockImplementation(
      (subject: string, publicKey: string, privateKey: string) => {
        realWebPush.setVapidDetails(subject, publicKey, privateKey);
      }
    );
  });

  it('does not crash, send, or delete subscriptions, and logs once', async () => {
    setVapidEnv(
      'not-a-vapid-public-key',
      'not-a-vapid-private-key',
      'not-a-valid-subject'
    );

    const service = loadService();

    await expect(service.sendNotification(subscription, payload)).resolves.toBe(
      false
    );
    await expect(service.sendNotification(subscription, payload)).resolves.toBe(
      false
    );

    expect(mockSetVapidDetails).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('batch sends return zeros with malformed keys and a valid subject', async () => {
    setVapidEnv(
      'not-a-vapid-public-key',
      'not-a-vapid-private-key',
      'mailto:test@example.com'
    );

    const service = loadService();

    await expect(
      service.sendToRestaurant('restaurant-1', payload)
    ).resolves.toEqual({ sent: 0, failed: 0 });

    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
