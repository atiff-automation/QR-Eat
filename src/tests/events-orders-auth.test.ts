import { NextRequest } from 'next/server';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';
import { GET as staffEventsRoute } from '@/app/api/events/orders/route';

jest.mock('server-only', () => ({}));

jest.mock('@/lib/tenant-context', () => ({
  getTenantContext: jest.fn(),
  requireAuth: jest.fn(),
}));

function request() {
  return new NextRequest('http://localhost/api/events/orders');
}

describe('GET /api/events/orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 AUTHENTICATION_REQUIRED for an anonymous request', async () => {
    (getTenantContext as jest.Mock).mockResolvedValue(null);
    (requireAuth as jest.Mock).mockImplementation(() => {
      throw new Error('Authentication required');
    });

    const response = await staffEventsRoute(request());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('keeps a genuine setup failure at 500', async () => {
    (getTenantContext as jest.Mock).mockRejectedValue(
      new Error('database unavailable')
    );

    const response = await staffEventsRoute(request());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to setup real-time connection' });
    expect(requireAuth).not.toHaveBeenCalled();
  });
});
