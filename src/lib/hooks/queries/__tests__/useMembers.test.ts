/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Member hooks.
 *
 * Node environment, so the hook tests inspect the config passed to TanStack
 * Query. The PII assertions prove the phone stays in the POST body and never
 * reaches a URL, query key or export link.
 */

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({ defaultOptions: {} })),
  useQuery: (...args: unknown[]) => {
    mockUseQuery(...args);
    return { data: null, isLoading: false, error: null };
  },
  useMutation: (...args: unknown[]) => {
    mockUseMutation(...args);
    return { mutateAsync: jest.fn(), isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

function getQueryConfig(hookFn: (...args: unknown[]) => unknown) {
  mockUseQuery.mockClear();
  hookFn();
  return mockUseQuery.mock.calls[0]?.[0];
}

function getMutationConfig(hookFn: (...args: unknown[]) => unknown) {
  mockUseMutation.mockClear();
  hookFn();
  return mockUseMutation.mock.calls[0]?.[0];
}

const member = {
  id: 'member-1',
  name: 'Aisyah',
  phone: '+60123456789',
  maskedPhone: '+60******89',
  status: 'ACTIVE' as const,
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
  updatedAt: '2026-11-01T00:00:00.000Z',
  card: { visitsInCycle: 2, visitsRequired: 3, cycleNumber: 1 },
};

describe('member lookup and profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the phone in the POST body with a fixed purpose', async () => {
    const {
      useMemberSearch,
      MEMBER_SEARCH_PURPOSE,
    } = require('@/lib/hooks/queries/useMembers');
    const config = getMutationConfig(useMemberSearch);
    (ApiClient.post as jest.Mock).mockResolvedValue({ members: [member] });

    await config.mutationFn('+60123456789');

    expect(ApiClient.post).toHaveBeenCalledTimes(1);
    const [endpoint, body, options] = (ApiClient.post as jest.Mock).mock
      .calls[0];

    expect(endpoint).toBe('/members/search');
    expect(body).toEqual({
      phone: '+60123456789',
      purpose: MEMBER_SEARCH_PURPOSE,
    });
    expect(body.purpose).toBeTruthy();
    // The phone is not in the endpoint or the query key.
    expect(endpoint).not.toContain('+60123456789');
    expect(JSON.stringify(options ?? {})).not.toContain('+60123456789');
    expect(JSON.stringify(config.queryKey ?? [])).not.toContain('+60123456789');
  });

  it('reads the profile by id and disables the query before permission', async () => {
    const {
      useMemberProfile,
      MEMBER_PROFILE_PURPOSE,
    } = require('@/lib/hooks/queries/useMembers');

    const config = getQueryConfig(() =>
      useMemberProfile('member-1', { enabled: false })
    );

    expect(config.queryKey).toEqual(queryKeys.members.profile('member-1'));
    expect(config.queryKey).not.toContain('+60123456789');
    expect(config.enabled).toBe(false);

    (ApiClient.get as jest.Mock).mockResolvedValue({ member });
    const result = await config.queryFn();

    expect(result).toEqual(member);
    expect(ApiClient.get).toHaveBeenCalledWith('/members/member-1', {
      params: { purpose: MEMBER_PROFILE_PURPOSE },
    });
  });

  it('does not run the profile query without a member id', () => {
    const { useMemberProfile } = require('@/lib/hooks/queries/useMembers');
    const config = getQueryConfig(() => useMemberProfile(null));

    expect(config.enabled).toBe(false);
  });
});

describe('member mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('withdraws consent with a fresh Idempotency-Key per call', async () => {
    const { useWithdrawConsent } = require('@/lib/hooks/queries/useMembers');
    const config = getMutationConfig(useWithdrawConsent);

    await config.mutationFn({ memberId: 'member-1', scope: 'LOYALTY' });
    await config.mutationFn({ memberId: 'member-1', scope: 'MARKETING' });

    expect(ApiClient.post).toHaveBeenCalledTimes(2);
    const first = (ApiClient.post as jest.Mock).mock.calls[0];
    const second = (ApiClient.post as jest.Mock).mock.calls[1];

    expect(first[0]).toBe('/members/member-1/withdraw-consent');
    expect(first[1]).toEqual({ scope: 'LOYALTY' });
    expect(second[1]).toEqual({ scope: 'MARKETING' });
    expect(first[2].headers['Idempotency-Key']).toBeTruthy();
    expect(second[2].headers['Idempotency-Key']).toBeTruthy();
    expect(first[2].headers['Idempotency-Key']).not.toBe(
      second[2].headers['Idempotency-Key']
    );
  });

  it('records marketing consent with a fresh Idempotency-Key', async () => {
    const {
      useRecordMarketingConsent,
      MARKETING_CONSENT_PURPOSE,
    } = require('@/lib/hooks/queries/useMembers');
    const config = getMutationConfig(useRecordMarketingConsent);

    await config.mutationFn('member-1');
    await config.mutationFn('member-1');

    const first = (ApiClient.post as jest.Mock).mock.calls[0];
    const second = (ApiClient.post as jest.Mock).mock.calls[1];

    expect(first[0]).toBe('/members/member-1/marketing-consent');
    expect(first[1]).toEqual({ purpose: MARKETING_CONSENT_PURPOSE });
    expect(first[2].headers['Idempotency-Key']).toBeTruthy();
    expect(first[2].headers['Idempotency-Key']).not.toBe(
      second[2].headers['Idempotency-Key']
    );
  });

  it('renames with a fresh Idempotency-Key and the name in the PATCH body', async () => {
    const { useRenameMember } = require('@/lib/hooks/queries/useMembers');
    const config = getMutationConfig(useRenameMember);

    await config.mutationFn({ memberId: 'member-1', name: 'Aisyah' });
    await config.mutationFn({ memberId: 'member-1', name: null });

    const first = (ApiClient.patch as jest.Mock).mock.calls[0];
    const second = (ApiClient.patch as jest.Mock).mock.calls[1];

    expect(first[0]).toBe('/members/member-1');
    expect(first[1]).toEqual({ name: 'Aisyah' });
    expect(second[1]).toEqual({ name: null });
    expect(first[2].headers['Idempotency-Key']).toBeTruthy();
    expect(first[2].headers['Idempotency-Key']).not.toBe(
      second[2].headers['Idempotency-Key']
    );
  });

  it('deletes with a fresh Idempotency-Key', async () => {
    const { useDeleteMember } = require('@/lib/hooks/queries/useMembers');
    const config = getMutationConfig(useDeleteMember);

    await config.mutationFn('member-1');
    await config.mutationFn('member-1');

    const first = (ApiClient.delete as jest.Mock).mock.calls[0];
    const second = (ApiClient.delete as jest.Mock).mock.calls[1];

    expect(first[0]).toBe('/members/member-1');
    expect(first[1].headers['Idempotency-Key']).toBeTruthy();
    expect(first[1].headers['Idempotency-Key']).not.toBe(
      second[1].headers['Idempotency-Key']
    );
  });
});

describe('member view helpers', () => {
  it('shows the full phone only with members:pii', () => {
    const { memberPhone } = require('@/lib/hooks/queries/useMembers');

    expect(memberPhone(member, true)).toBe('+60123456789');
    expect(memberPhone(member, false)).toBe('+60******89');
  });

  it('uses owner vocabulary for status and visit progress', () => {
    const {
      memberStatusLabel,
      memberVisitProgress,
    } = require('@/lib/hooks/queries/useMembers');

    expect(memberStatusLabel('ACTIVE')).toBe('Active member');
    expect(memberStatusLabel('ANONYMIZED')).toBe('Anonymised');
    expect(memberVisitProgress(member.card)).toBe('2 of 3 visits');
    expect(memberVisitProgress(null)).toBe('No visit card yet');
    expect(memberVisitProgress(member.card)).not.toMatch(/points|stamps/i);
  });

  it('builds export links without a phone', () => {
    const {
      memberExportHref,
      marketingExportHref,
    } = require('@/lib/hooks/queries/useMembers');

    const memberHref = memberExportHref('member-1');
    const marketingHref = marketingExportHref();

    expect(memberHref).toBe(
      '/api/members/member-1/export?purpose=Owner%20member%20export'
    );
    expect(marketingHref).toBe(
      '/api/members/export?purpose=Owner%20marketing%20list%20export'
    );
    expect(memberHref).not.toContain('phone');
    expect(marketingHref).not.toContain('phone');
  });
});
