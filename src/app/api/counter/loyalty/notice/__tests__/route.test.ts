import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { prisma } from '@/lib/database';
import { hashNoticeText } from '@/lib/loyalty/consent';
import { GET as getNotice } from '@/app/api/counter/loyalty/notice/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    loyaltySettings: { findUnique: jest.fn() },
  },
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const noticeText = 'Rewards notice text';
const noticeTextHash = hashNoticeText(noticeText);

const context = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  email: 'cashier@example.test',
  restaurantId,
  permissions: { loyalty: ['attach'] },
  isAdmin: false,
  mustChangePassword: false,
};

const settings = {
  enabled: true,
  noticeVersion: 'v1',
  noticeText,
  noticeTextHash,
  privacyUrl: 'https://example.test/privacy',
  termsText: 'Terms',
};

function request() {
  return new NextRequest('http://localhost/api/counter/loyalty/notice');
}

describe('GET /api/counter/loyalty/notice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOYALTY_ENABLED = 'true';

    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(
      settings
    );
  });

  afterAll(() => {
    delete process.env.LOYALTY_ENABLED;
  });

  it('returns the server-derived notice when loyalty is active', async () => {
    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      enabled: true,
      notice: {
        version: 'v1',
        text: noticeText,
        textHash: noticeTextHash,
        privacyUrl: 'https://example.test/privacy',
        termsText: 'Terms',
      },
    });
    expect(json.notice.textHash).toBe(hashNoticeText(json.notice.text));
    expect(prisma.loyaltySettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId } })
    );
  });

  it('returns enabled:false without querying the database when the global flag is off', async () => {
    delete process.env.LOYALTY_ENABLED;

    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, enabled: false, notice: null });
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns enabled:false when the restaurant setting is off', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      enabled: false,
    });

    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, enabled: false, notice: null });
  });

  it('returns enabled:false when the notice is missing the privacy URL', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      privacyUrl: null,
    });

    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, enabled: false, notice: null });
  });

  it('returns enabled:false when the stored hash does not match the text', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue({
      ...settings,
      noticeTextHash: hashNoticeText('a different notice'),
    });

    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, enabled: false, notice: null });
  });

  it('returns enabled:false when no settings row exists', async () => {
    (prisma.loyaltySettings.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, enabled: false, notice: null });
  });

  it('returns 403 PERMISSION_DENIED without loyalty:attach', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: attach on loyalty');
    });

    const response = await getNotice(request());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);

    const response = await getNotice(request());

    expect(response.status).toBe(401);
    expect(prisma.loyaltySettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns no member, phone, phoneHash or customerId field', async () => {
    const response = await getNotice(request());
    const json = await response.json();

    expect(Object.keys(json).sort()).toEqual(['enabled', 'notice', 'success']);
    expect(Object.keys(json.notice).sort()).toEqual([
      'privacyUrl',
      'termsText',
      'text',
      'textHash',
      'version',
    ]);
    expect(JSON.stringify(json)).not.toMatch(
      /phoneHash|customerId|"member"|"phone"/
    );
  });
});
