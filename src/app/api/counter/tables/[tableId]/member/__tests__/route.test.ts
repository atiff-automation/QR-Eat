import { NextRequest } from 'next/server';
import {
  getTenantContext,
  requireAuth,
  requirePermission,
} from '@/lib/tenant-context';
import { counterAccessDenied } from '@/lib/counter/access';
import { LoyaltyConfigurationError } from '@/lib/loyalty/phone';
import {
  changeMember,
  removeMember,
} from '@/lib/services/loyalty-bill-service';
import { POST as attachTableMember } from '@/app/api/counter/tables/[tableId]/member/route';
import { POST as removeTableMember } from '@/app/api/counter/tables/[tableId]/member/remove/route';
import { POST as attachOrderMember } from '@/app/api/counter/orders/[orderId]/member/route';
import { POST as removeOrderMember } from '@/app/api/counter/orders/[orderId]/member/remove/route';

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/counter/access', () => ({
  counterAccessDenied: jest.fn(() => null),
}));

jest.mock('@/lib/services/loyalty-bill-service', () => ({
  changeMember: jest.fn(),
  removeMember: jest.fn(),
}));

const restaurantId = '550e8400-e29b-41d4-a716-446655440001';
const tableId = '550e8400-e29b-41d4-a716-446655440002';
const orderId = '550e8400-e29b-41d4-a716-446655440005';

const context = {
  userId: 'user-1',
  userType: 'staff',
  roleTemplate: 'cashier',
  email: 'cashier@example.test',
  restaurantId,
  permissions: { loyalty: ['attach'], orders: ['write'] },
  isAdmin: false,
  mustChangePassword: false,
};

const successBody = {
  success: true,
  billRevision: 8,
  member: {
    id: 'cus-1',
    name: 'Aina',
    maskedPhone: '+60•••••••89',
    completedVisits: 0,
    visitsRequired: 3,
  },
  visitState: 'COUNTS',
};

function postRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'member-key-1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const attachBody = {
  phone: '+60123456789',
  expectedBillRevision: 7,
};

describe('Counter member routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantContext as jest.Mock).mockResolvedValue(context);
    (requireAuth as jest.Mock).mockReturnValue(context);
    (requirePermission as jest.Mock).mockReturnValue(undefined);
    (counterAccessDenied as jest.Mock).mockReturnValue(null);
    (changeMember as jest.Mock).mockResolvedValue({
      status: 200,
      body: successBody,
    });
    (removeMember as jest.Mock).mockResolvedValue({
      status: 200,
      body: { ...successBody, member: null, visitState: 'GUEST' },
    });
  });

  it('attaches a member to a table bill', async () => {
    const response = await attachTableMember(
      postRequest(`/api/counter/tables/${tableId}/member`, attachBody),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(successBody);
    expect(changeMember).toHaveBeenCalledWith({
      restaurantId,
      target: { kind: 'table', tableId },
      userId: 'user-1',
      phone: '+60123456789',
      name: undefined,
      consent: undefined,
      consentVersion: undefined,
      consentTextHash: undefined,
      expectedBillRevision: 7,
      idempotencyKey: 'member-key-1',
    });
  });

  it('requires an Idempotency-Key', async () => {
    const response = await attachTableMember(
      postRequest(`/api/counter/tables/${tableId}/member`, attachBody, {
        'idempotency-key': '',
      }),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(changeMember).not.toHaveBeenCalled();
  });

  it('returns 403 when the cashier lacks loyalty:attach', async () => {
    (requirePermission as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Permission denied: attach on loyalty');
    });

    const response = await attachTableMember(
      postRequest(`/api/counter/tables/${tableId}/member`, attachBody),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
    expect(changeMember).not.toHaveBeenCalled();
  });

  it('rejects invalid body data', async () => {
    const response = await attachTableMember(
      postRequest(`/api/counter/tables/${tableId}/member`, {
        phone: '+60123456789',
      }),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    });
    expect(changeMember).not.toHaveBeenCalled();
  });

  it('marks a replayed response with the Idempotent-Replay header', async () => {
    (changeMember as jest.Mock).mockResolvedValue({
      status: 200,
      body: successBody,
      replayed: true,
    });

    const response = await attachTableMember(
      postRequest(`/api/counter/tables/${tableId}/member`, attachBody),
      { params: Promise.resolve({ tableId }) }
    );

    expect(response.headers.get('Idempotent-Replay')).toBe('true');
  });

  it('removes the member from a table bill', async () => {
    const response = await removeTableMember(
      postRequest(`/api/counter/tables/${tableId}/member/remove`, {
        expectedBillRevision: 7,
      }),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.member).toBeNull();
    expect(removeMember).toHaveBeenCalledWith({
      restaurantId,
      target: { kind: 'table', tableId },
      userId: 'user-1',
      expectedBillRevision: 7,
      idempotencyKey: 'member-key-1',
    });
  });

  it('attaches a member to a takeaway order', async () => {
    const response = await attachOrderMember(
      postRequest(`/api/counter/orders/${orderId}/member`, attachBody),
      { params: Promise.resolve({ orderId }) }
    );

    expect(response.status).toBe(200);
    expect(changeMember).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'order', orderId },
        expectedBillRevision: 7,
      })
    );
  });

  it('removes the member from a takeaway order', async () => {
    const response = await removeOrderMember(
      postRequest(`/api/counter/orders/${orderId}/member/remove`, {
        expectedBillRevision: 7,
      }),
      { params: Promise.resolve({ orderId }) }
    );

    expect(response.status).toBe(200);
    expect(removeMember).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'order', orderId },
        expectedBillRevision: 7,
      })
    );
  });

  it('passes service errors through unchanged', async () => {
    (changeMember as jest.Mock).mockResolvedValue({
      status: 409,
      body: {
        success: false,
        error: 'The bill changed. Reload the bill and try again.',
        code: 'BILL_CHANGED',
      },
    });

    const response = await attachTableMember(
      postRequest(`/api/counter/tables/${tableId}/member`, attachBody),
      { params: Promise.resolve({ tableId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({ success: false, code: 'BILL_CHANGED' });
  });

  type MemberHandler = (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ) => Promise<Response>;

  async function expectConfigurationError(
    handler: unknown,
    params: Record<string, string>,
    body: unknown,
    service: jest.Mock
  ) {
    service.mockRejectedValueOnce(
      new LoyaltyConfigurationError('PHONE_HMAC_KEY_MISSING')
    );

    const response = await (handler as MemberHandler)(
      postRequest('/api/counter/member', body),
      { params: Promise.resolve(params) }
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({
      success: false,
      code: 'LOYALTY_CONFIGURATION_ERROR',
    });
    expect(json).not.toHaveProperty('phone');
  }

  it('maps a missing HMAC key on the table attach route', async () => {
    await expectConfigurationError(
      attachTableMember,
      { tableId },
      attachBody,
      changeMember as jest.Mock
    );
  });

  it('maps a missing HMAC key on the table remove route', async () => {
    await expectConfigurationError(
      removeTableMember,
      { tableId },
      { expectedBillRevision: 7 },
      removeMember as jest.Mock
    );
  });

  it('maps a missing HMAC key on the order attach route', async () => {
    await expectConfigurationError(
      attachOrderMember,
      { orderId },
      attachBody,
      changeMember as jest.Mock
    );
  });

  it('maps a missing HMAC key on the order remove route', async () => {
    await expectConfigurationError(
      removeOrderMember,
      { orderId },
      { expectedBillRevision: 7 },
      removeMember as jest.Mock
    );
  });
});
