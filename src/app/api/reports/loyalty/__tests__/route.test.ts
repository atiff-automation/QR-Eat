import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  getLoyaltyReport,
  LoyaltyReportValidationError,
} from '@/lib/services/loyalty-report-service';
import { GET } from '@/app/api/reports/loyalty/route';

jest.mock('@/lib/database', () => ({ prisma: {} }));
jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));
jest.mock('@/lib/services/loyalty-report-service', () => {
  const actual = jest.requireActual('@/lib/services/loyalty-report-service');
  return { ...actual, getLoyaltyReport: jest.fn() };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: { loyalty: ['report'] },
  isAdmin: false,
  mustChangePassword: false,
};

const report = {
  range: {
    from: '2026-11-01',
    to: '2026-11-30',
    timezone: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
  },
  gross: '90.00',
  discounts: {
    total: '22.00',
    bySource: { PROMOTION: '15.00', LOYALTY_REWARD: '7.00' },
  },
  net: '75.00',
  refunds: '5.00',
  visits: {
    count: 4,
    uniqueMembers: 2,
    repeatMembers: 1,
    repeatRate: '0.5000',
  },
  rewards: { applied: 1, amount: '7.00' },
  promotionRedemptions: {
    total: 2,
    byScope: {
      ORDER: { count: 1, amount: '5.00' },
      CATEGORY: { count: 0, amount: '0.00' },
      ITEM: { count: 1, amount: '10.00' },
    },
  },
  members: {
    total: 12,
    active: 10,
    anonymized: 2,
    newInRange: 3,
    marketingOptIn: 4,
  },
};

function request(query = '?from=2026-11-01&to=2026-11-30'): NextRequest {
  return new NextRequest(`http://localhost/api/reports/loyalty${query}`);
}

describe('loyalty report route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (getLoyaltyReport as jest.Mock).mockResolvedValue(report);
  });

  it('returns the report with loyalty:report for the business-date range', async () => {
    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'loyalty',
      'report'
    );
    expect(getLoyaltyReport).toHaveBeenCalledWith({
      restaurantId,
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(json).toEqual({ success: true, report });
  });

  it('maps a bad range to 400', async () => {
    (getLoyaltyReport as jest.Mock).mockRejectedValue(
      new LoyaltyReportValidationError('from must be a business date')
    );

    const response = await GET(request(''));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('INVALID_REQUEST');
  });

  it('denies a caller without loyalty:report', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.code).toBe('PERMISSION_DENIED');
    expect(getLoyaltyReport).not.toHaveBeenCalled();
  });
});
