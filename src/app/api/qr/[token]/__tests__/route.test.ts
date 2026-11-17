import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { getQrOrderingAvailability } from '@/lib/qr-ordering-availability';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { GET as getToken } from '@/app/api/qr/[token]/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    table: { findUnique: jest.fn(), findFirst: jest.fn() },
    loyaltySettings: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/qr-ordering-availability', () => ({
  getQrOrderingAvailability: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const token = 'qr-token-1';
const noticeText = 'Rewards notice v1';
const noticeTextHash = hashNoticeText(noticeText);

const table = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  tableNumber: '1',
  tableName: 'Window Table',
  capacity: 4,
  status: 'AVAILABLE',
  locationDescription: null,
  restaurant: {
    id: restaurantId,
    name: 'Test Restaurant',
    slug: 'test',
    address: '1 Road',
    phone: null,
    description: null,
    currency: 'MYR',
    taxRate: 0.06,
    serviceChargeRate: 0.1,
    taxLabel: 'Tax',
    serviceChargeLabel: 'Service Charge',
    isActive: true,
  },
};

const settings = {
  restaurantId,
  enabled: true,
  visitsRequired: 3,
  rewardLabel: '10% off, max RM15',
  noticeVersion: 'v1',
  noticeText,
  noticeTextHash,
  privacyUrl: 'https://example.test/privacy',
  termsText: 'Terms',
};

function request() {
  return new NextRequest(`http://localhost/api/qr/${token}`);
}

describe('GET /api/qr/[token] loyalty notice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_ENABLED = 'true';
    (prisma.table.findUnique as jest.Mock).mockResolvedValue(table);
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settings
    );
    (getQrOrderingAvailability as jest.Mock).mockResolvedValue({
      available: true,
      reason: 'AVAILABLE',
      message: null,
      lastCounterActivityAt: new Date('2026-11-13T10:00:00.000Z'),
    });
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
  });

  it('adds the server-derived notice when loyalty is active', async () => {
    const response = await getToken(request(), {
      params: Promise.resolve({ token }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.loyaltyNotice).toEqual({
      version: 'v1',
      text: noticeText,
      textHash: noticeTextHash,
      privacyUrl: 'https://example.test/privacy',
      termsText: 'Terms',
      visitsRequired: 3,
      rewardLabel: '10% off, max RM15',
    });
    expect(prisma.loyaltySettings.findUnique).toHaveBeenCalledWith({
      where: { restaurantId },
    });
  });

  it('does not query loyalty settings when the flag is off', async () => {
    delete process.env.LOYALTY_ENABLED;

    const response = await getToken(request(), {
      params: Promise.resolve({ token }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.loyaltyNotice).toBeNull();
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns a null notice when the restaurant setting is off', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      enabled: false,
    });

    const response = await getToken(request(), {
      params: Promise.resolve({ token }),
    });
    const json = await response.json();

    expect(json.loyaltyNotice).toBeNull();
  });

  it('returns a null notice when the stored notice is inconsistent', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      noticeTextHash: 'wrong-hash',
    });

    const response = await getToken(request(), {
      params: Promise.resolve({ token }),
    });
    const json = await response.json();

    expect(json.loyaltyNotice).toBeNull();
  });
});
