import { NextRequest } from 'next/server';
import {
  getTenantContext,
  hasPermission,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { requireRestaurantAccess } from '@/lib/rbac/resource-auth';
import {
  deleteMember,
  exportMarketingMembers,
  exportMember,
  getMember,
  marketingMembersToCsv,
  memberToCsv,
  MemberNotFoundError,
  MemberStateError,
  recordMarketingConsent,
  searchMembers,
  withdrawMemberConsent,
} from '@/lib/services/loyalty-member-service';
import { POST as searchRoute } from '@/app/api/members/search/route';
import {
  DELETE as deleteRoute,
  GET as profileRoute,
} from '@/app/api/members/[id]/route';
import { GET as exportRoute } from '@/app/api/members/[id]/export/route';
import { GET as listExportRoute } from '@/app/api/members/export/route';
import { POST as withdrawRoute } from '@/app/api/members/[id]/withdraw-consent/route';
import { POST as marketingRoute } from '@/app/api/members/[id]/marketing-consent/route';

jest.mock('@/lib/database', () => ({ prisma: {} }));
jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
  hasPermission: jest.fn(),
}));
jest.mock('@/lib/rbac/resource-auth', () => ({
  requireRestaurantAccess: jest.fn(),
}));
jest.mock('@/lib/services/loyalty-member-service', () => {
  const actual = jest.requireActual('@/lib/services/loyalty-member-service');
  return {
    ...actual,
    searchMembers: jest.fn(),
    getMember: jest.fn(),
    exportMarketingMembers: jest.fn(),
    exportMember: jest.fn(),
    marketingMembersToCsv: jest.fn(),
    memberToCsv: jest.fn(),
    withdrawMemberConsent: jest.fn(),
    recordMarketingConsent: jest.fn(),
    deleteMember: jest.fn(),
  };
});

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const memberId = '11111111-1111-4111-8111-111111111111';

const context = {
  userId: 'user-1',
  userType: 'restaurant_owner',
  email: 'owner@example.test',
  restaurantId,
  permissions: {
    members: ['read', 'pii', 'export', 'delete', 'consent_withdraw'],
    loyalty: ['report'],
  },
  isAdmin: false,
  mustChangePassword: false,
};

const member = {
  id: memberId,
  name: 'Aina',
  phone: null,
  maskedPhone: '+60•••••••89',
  status: 'ACTIVE',
  consentAt: '2026-11-01T00:00:00.000Z',
  consentVersion: 'v1',
  consentSource: 'QR',
  consentWithdrawnAt: null,
  marketingOptIn: false,
  marketingConsentAt: null,
  marketingConsentVersion: null,
  marketingConsentSource: null,
  marketingWithdrawnAt: null,
  anonymizedAt: null,
  lastVisitAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  card: null,
};

const params = { params: Promise.resolve({ id: memberId }) };

function postRequest(path: string, body: unknown, key = 'key-1'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
}

function deleteRequest(path: string, key = 'key-1'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'DELETE',
    headers: { 'idempotency-key': key },
  });
}

function getRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('owner member routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (requireRestaurantAccess as jest.Mock).mockResolvedValue(undefined);
    (hasPermission as jest.Mock).mockReturnValue(true);

    (searchMembers as jest.Mock).mockResolvedValue({ members: [member] });
    (getMember as jest.Mock).mockResolvedValue({ member });
    (exportMarketingMembers as jest.Mock).mockResolvedValue({
      rows: [
        {
          id: memberId,
          name: 'Aina',
          phone: '+60123456789',
          marketingConsentAt: '2026-11-02T00:00:00.000Z',
          marketingConsentVersion: 'v1',
        },
      ],
      count: 1,
    });
    (marketingMembersToCsv as jest.Mock).mockReturnValue(
      'member_id,name,phone\nmember-1,Aina,+60123456789\n'
    );
    (exportMember as jest.Mock).mockResolvedValue({ member });
    (memberToCsv as jest.Mock).mockReturnValue(
      'member_id,name,phone\nmember-1,Aina,+60123456789\n'
    );
    (withdrawMemberConsent as jest.Mock).mockResolvedValue({
      member,
      scope: 'LOYALTY',
      replayed: false,
      statusCode: 200,
    });
    (recordMarketingConsent as jest.Mock).mockResolvedValue({
      member,
      noticeVersion: 'v1',
      replayed: false,
      statusCode: 200,
    });
    (deleteMember as jest.Mock).mockResolvedValue({
      member: { ...member, status: 'ANONYMIZED' },
      ordersAnonymised: 2,
      replayed: false,
      statusCode: 200,
    });
  });

  it('searches with members:read and passes the phone in the body', async () => {
    const response = await searchRoute(
      postRequest('/api/members/search', {
        phone: '0123456789',
        purpose: 'Counter lookup',
      })
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(context, 'members', 'read');
    expect(searchMembers).toHaveBeenCalledWith({
      restaurantId,
      actorId: 'user-1',
      actorType: 'restaurant_owner',
      phone: '0123456789',
      purpose: 'Counter lookup',
      revealPhone: true,
    });
  });

  it('masks search results when the caller lacks members:pii', async () => {
    (hasPermission as jest.Mock).mockImplementation(
      (_context: unknown, resource: string, action: string) =>
        !(resource === 'members' && action === 'pii')
    );

    await searchRoute(
      postRequest('/api/members/search', {
        phone: '0123456789',
        purpose: 'Counter lookup',
      })
    );

    expect(searchMembers).toHaveBeenCalledWith(
      expect.objectContaining({ revealPhone: false })
    );
  });

  it('rejects an invalid search body before touching the service', async () => {
    const response = await searchRoute(
      postRequest('/api/members/search', { purpose: 'no phone' })
    );

    expect(response.status).toBe(400);
    expect(searchMembers).not.toHaveBeenCalled();
  });

  it('requires a non-empty purpose on search', async () => {
    const response = await searchRoute(
      postRequest('/api/members/search', {
        phone: '0123456789',
        purpose: '   ',
      })
    );

    expect(response.status).toBe(400);
    expect(searchMembers).not.toHaveBeenCalled();
  });

  it('rejects a search phone longer than 32 characters', async () => {
    const response = await searchRoute(
      postRequest('/api/members/search', {
        phone: '+'.padEnd(33, '6'),
        purpose: 'Counter lookup',
      })
    );

    expect(response.status).toBe(400);
    expect(searchMembers).not.toHaveBeenCalled();
  });

  it('returns a profile with members:read', async () => {
    const response = await profileRoute(
      getRequest(`/api/members/${memberId}?purpose=Support`),
      params
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(context, 'members', 'read');
    expect(getMember).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        memberId,
        purpose: 'Support',
        revealPhone: true,
      })
    );
  });

  it('maps a cross-tenant profile lookup to 404, not 403', async () => {
    (getMember as jest.Mock).mockRejectedValue(new MemberNotFoundError());

    const response = await profileRoute(
      getRequest(`/api/members/${memberId}`),
      params
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe('NOT_FOUND');
  });

  it('streams the marketing-opted-in list CSV with members:export', async () => {
    const response = await listExportRoute(
      getRequest('/api/members/export?purpose=Campaign')
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'members',
      'export'
    );
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment; filename="loyalty-marketing-members.csv"'
    );
    expect(await response.text()).toContain('+60123456789');
    expect(exportMarketingMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        purpose: 'Campaign',
        revealPhone: true,
      })
    );
    expect(exportMember).not.toHaveBeenCalled();
  });

  it('streams one member subject-access export with the target id', async () => {
    const response = await exportRoute(
      getRequest(`/api/members/${memberId}/export?purpose=Subject%20access`),
      params
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'members',
      'export'
    );
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      `attachment; filename="member-${memberId}.csv"`
    );
    expect(await response.text()).toContain('+60123456789');
    expect(exportMember).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        memberId,
        purpose: 'Subject access',
        revealPhone: true,
      })
    );
    expect(exportMarketingMembers).not.toHaveBeenCalled();
  });

  it('withdraws consent with members:consent_withdraw and an idempotency key', async () => {
    const response = await withdrawRoute(
      postRequest(
        `/api/members/${memberId}/withdraw-consent`,
        { scope: 'LOYALTY' },
        'withdraw-key'
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'members',
      'consent_withdraw'
    );
    expect(withdrawMemberConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        memberId,
        scope: 'LOYALTY',
        idempotencyKey: 'withdraw-key',
      })
    );
  });

  it('requires an Idempotency-Key for withdrawal', async () => {
    const request = new NextRequest(
      `http://localhost/api/members/${memberId}/withdraw-consent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'LOYALTY' }),
      }
    );

    const response = await withdrawRoute(request, params);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(withdrawMemberConsent).not.toHaveBeenCalled();
  });

  it('rejects an unknown withdrawal scope', async () => {
    const response = await withdrawRoute(
      postRequest(`/api/members/${memberId}/withdraw-consent`, {
        scope: 'EVERYTHING',
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(withdrawMemberConsent).not.toHaveBeenCalled();
  });

  it('records marketing consent with an idempotency key and purpose', async () => {
    const response = await marketingRoute(
      postRequest(
        `/api/members/${memberId}/marketing-consent`,
        { purpose: 'Campaign opt-in' },
        'm-key'
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'members',
      'consent_withdraw'
    );
    expect(recordMarketingConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId,
        memberId,
        purpose: 'Campaign opt-in',
        idempotencyKey: 'm-key',
      })
    );
  });

  it('maps a forbidden marketing consent to 409', async () => {
    (recordMarketingConsent as jest.Mock).mockRejectedValue(
      new MemberStateError('Loyalty consent withdrawn', 'CONSENT_WITHDRAWN')
    );

    const response = await marketingRoute(
      postRequest(`/api/members/${memberId}/marketing-consent`, {}, 'm-key'),
      params
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe('CONSENT_WITHDRAWN');
  });

  it('anonymises with members:delete and an idempotency key', async () => {
    const response = await deleteRoute(
      deleteRequest(`/api/members/${memberId}`, 'delete-key'),
      params
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      context,
      'members',
      'delete'
    );
    expect(deleteMember).toHaveBeenCalledWith(
      expect.objectContaining({ memberId, idempotencyKey: 'delete-key' })
    );
    expect(json.ordersAnonymised).toBe(2);
  });

  it('requires an Idempotency-Key for deletion', async () => {
    const response = await deleteRoute(
      new NextRequest(`http://localhost/api/members/${memberId}`, {
        method: 'DELETE',
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(deleteMember).not.toHaveBeenCalled();
  });

  it('denies every member endpoint without its permission', async () => {
    (requirePermission as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const responses = await Promise.all([
      searchRoute(
        postRequest('/api/members/search', {
          phone: '0123456789',
          purpose: 'Counter lookup',
        })
      ),
      profileRoute(getRequest(`/api/members/${memberId}`), params),
      exportRoute(getRequest(`/api/members/${memberId}/export`), params),
      listExportRoute(getRequest('/api/members/export')),
      withdrawRoute(
        postRequest(`/api/members/${memberId}/withdraw-consent`, {
          scope: 'LOYALTY',
        }),
        params
      ),
      marketingRoute(
        postRequest(`/api/members/${memberId}/marketing-consent`, {}),
        params
      ),
      deleteRoute(deleteRequest(`/api/members/${memberId}`), params),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.code).toBe('PERMISSION_DENIED');
    }
  });
});
