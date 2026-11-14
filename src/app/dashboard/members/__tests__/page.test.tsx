/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Members page states and member cards.
 *
 * Node environment, so the page is rendered to static markup with its hooks
 * mocked. The presentational cards are rendered directly to cover masked vs
 * full phone and the permission-gated actions.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseRole = jest.fn();
const mockUseMemberSearch = jest.fn();
const mockUseMemberProfile = jest.fn();

jest.mock('@/components/rbac/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

jest.mock('@/lib/hooks/queries/useMembers', () => {
  const actual = jest.requireActual('@/lib/hooks/queries/useMembers');
  return {
    ...actual,
    useMemberSearch: () => mockUseMemberSearch(),
    useMemberProfile: (...args: unknown[]) => mockUseMemberProfile(...args),
    useWithdrawConsent: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRecordMarketingConsent: () => ({
      mutateAsync: jest.fn(),
      isPending: false,
    }),
    useRenameMember: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useDeleteMember: () => ({ mutateAsync: jest.fn(), isPending: false }),
  };
});

const MembersPage = require('@/app/dashboard/members/page').default;
const {
  DELETE_MEMBER_CONFIRMATION_MESSAGE,
  MemberProfileCard,
  MemberResultsList,
} = require('@/app/dashboard/members/MembersStates');

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

const noop = () => {};

function authorisedRole(overrides: Record<string, boolean> = {}) {
  return {
    hasPermission: (permission: string) => {
      if (permission in overrides) return overrides[permission];
      return [
        'members:read',
        'members:pii',
        'members:export',
        'members:delete',
        'members:consent_withdraw',
      ].includes(permission);
    },
    isLoading: false,
  };
}

function renderPage() {
  return renderToStaticMarkup(<MembersPage />);
}

function renderProfile(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <MemberProfileCard
      member={member}
      canViewPii={false}
      canEditName={false}
      canExport={false}
      canWithdrawConsent={false}
      canDelete={false}
      isBusy={false}
      onWithdraw={noop}
      onMarketingConsent={noop}
      onRename={noop}
      onDelete={noop}
      {...overrides}
    />
  );
}

describe('MembersPage states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRole.mockReturnValue(authorisedRole());
    mockUseMemberSearch.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockUseMemberProfile.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders a permission-denied state and keeps queries disabled', () => {
    mockUseRole.mockReturnValue({
      hasPermission: () => false,
      isLoading: false,
    });

    const markup = renderPage();

    expect(markup).toContain('owner-managed');
    expect(markup).toContain('members:read');
    expect(markup).not.toContain('Search member');
    expect(mockUseMemberProfile).toHaveBeenCalledWith(null, { enabled: false });
  });

  it('renders the search form and the pre-search empty state', () => {
    const markup = renderPage();

    expect(markup).toContain('Phone number');
    expect(markup).toContain('Search member');
    expect(markup).toContain('Search for a member');
    expect(markup).toContain('Export marketing list');
    expect(mockUseMemberProfile).toHaveBeenCalledWith(null, { enabled: true });
  });

  it('renders a search loading state', () => {
    mockUseMemberSearch.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: true,
    });

    expect(renderPage()).toContain('Searching members...');
  });

  it('renders the permission-check loading state', () => {
    mockUseRole.mockReturnValue({
      hasPermission: () => false,
      isLoading: true,
    });

    expect(renderPage()).toContain('Checking permissions...');
  });
});

describe('MemberResultsList', () => {
  it('always masks the phone in the list and shows progress and status', () => {
    const markup = renderToStaticMarkup(
      <MemberResultsList
        members={[member]}
        selectedId="member-1"
        onSelect={noop}
      />
    );

    expect(markup).toContain('Aisyah');
    expect(markup).toContain('+60******89');
    expect(markup).not.toContain('+60123456789');
    expect(markup).toContain('2 of 3 visits');
    expect(markup).toContain('Active member');
  });
});

describe('MemberProfileCard', () => {
  it('masks the phone without members:pii', () => {
    const markup = renderProfile();

    expect(markup).toContain('+60******89');
    expect(markup).not.toContain('+60123456789');
    expect(markup).toContain('masked for your role');
  });

  it('shows the full phone with members:pii', () => {
    const markup = renderProfile({ canViewPii: true });

    expect(markup).toContain('+60123456789');
    expect(markup).not.toContain('masked for your role');
  });

  it('gates export, consent and delete actions by permission', () => {
    const restricted = renderProfile();
    expect(restricted).not.toContain('Export member CSV');
    expect(restricted).not.toContain('Withdraw loyalty consent');
    expect(restricted).not.toContain('Delete member');
    expect(restricted).toContain('cannot export, change consent, delete');

    const allowed = renderProfile({
      canExport: true,
      canWithdrawConsent: true,
      canDelete: true,
    });
    expect(allowed).toContain('Export member CSV');
    expect(allowed).toContain(
      '/api/members/member-1/export?purpose=Owner%20member%20export'
    );
    expect(allowed).toContain('Withdraw loyalty consent');
    expect(allowed).toContain('Delete member');
    expect(allowed).toContain('using your staff account as the actor');
    expect(allowed).not.toMatch(/points|stamps|cashback/i);
  });

  it('states plainly that delete anonymises and keeps financial records', () => {
    expect(DELETE_MEMBER_CONFIRMATION_MESSAGE).toContain('anonymises');
    expect(DELETE_MEMBER_CONFIRMATION_MESSAGE).toContain(
      'Financial records are kept'
    );
  });

  it('renders the edit-name control only with members:pii', () => {
    const withoutPii = renderProfile();
    expect(withoutPii).not.toContain('Edit name');
    expect(withoutPii).not.toContain('Save name');
    expect(withoutPii).not.toContain('Up to 80 characters');

    const withPii = renderProfile({ canEditName: true });
    expect(withPii).toContain('Edit name');
    expect(withPii).toContain('Save name');
    expect(withPii).toContain('Up to 80 characters');
    expect(withPii).toContain('aria-describedby="member-name-help"');
  });

  it('hides the edit-name control for an anonymised member', () => {
    const markup = renderProfile({
      canEditName: true,
      member: { ...member, status: 'ANONYMIZED', name: null },
    });

    expect(markup).not.toContain('Edit name');
    expect(markup).not.toContain('Save name');
  });
});
