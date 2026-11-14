import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { GET } from '@/app/api/health/route';

jest.mock('@/lib/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

const queryRaw = prisma.$queryRaw as jest.Mock;

function request(headers: Record<string, string> = {}): NextRequest {
  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    headers: {
      get: (name: string) => lower.get(name.toLowerCase()) ?? null,
    },
  } as unknown as NextRequest;
}

async function readBody(response: Response) {
  return (await response.json()) as {
    data?: Record<string, unknown>;
    error?: { details?: Record<string, unknown> };
  };
}

const originalRailwayEnvironment = process.env.RAILWAY_ENVIRONMENT;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe('GET /api/health edgeIp', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    process.env.RAILWAY_ENVIRONMENT = 'production';
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalRailwayEnvironment === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT;
    } else {
      process.env.RAILWAY_ENVIRONMENT = originalRailwayEnvironment;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('reports source and entry count without the address on success', async () => {
    const response = await GET(
      request({
        'x-real-ip': '203.0.113.9',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      })
    );
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(body.data?.edgeIp).toEqual({
      source: 'x-real-ip',
      xffEntries: 2,
    });
    expect(JSON.stringify(body)).not.toContain('203.0.113.9');
    expect(JSON.stringify(body)).not.toContain('10.0.0.1');
  });

  it('includes edgeIp in the DATABASE_URL-missing payload', async () => {
    delete process.env.DATABASE_URL;

    const response = await GET(request({ 'x-forwarded-for': '198.51.100.7' }));
    const body = await readBody(response);

    expect(response.status).toBe(503);
    expect(body.error?.details?.edgeIp).toEqual({
      source: 'x-forwarded-for',
      xffEntries: 1,
    });
    expect(JSON.stringify(body)).not.toContain('198.51.100.7');
  });

  it('includes edgeIp in the database-unavailable payload', async () => {
    queryRaw.mockRejectedValue(new Error('database down'));

    const response = await GET(request({ 'x-real-ip': '203.0.113.9' }));
    const body = await readBody(response);

    expect(response.status).toBe(503);
    expect(body.error?.details?.edgeIp).toEqual({
      source: 'x-real-ip',
      xffEntries: 0,
    });
    expect(JSON.stringify(body)).not.toContain('203.0.113.9');
  });

  it('includes edgeIp in the unexpected-error payload', async () => {
    jest.spyOn(process, 'uptime').mockImplementation(() => {
      throw new Error('uptime unavailable');
    });

    const response = await GET(request({ 'x-real-ip': '203.0.113.9' }));
    const body = await readBody(response);

    expect(response.status).toBe(503);
    expect(body.error?.details?.edgeIp).toEqual({
      source: 'x-real-ip',
      xffEntries: 0,
    });
    expect(JSON.stringify(body)).not.toContain('203.0.113.9');
  });
});
