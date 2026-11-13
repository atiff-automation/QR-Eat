/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Promotions page states.
 *
 * Node environment, so the client page is rendered to static markup with its
 * data hooks mocked. This covers permission-denied, loading, error and empty
 * states plus a populated list.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseRole = jest.fn();
const mockUsePromotions = jest.fn();
const mockUseMenu = jest.fn();
const mockUseSettings = jest.fn();

jest.mock('@/components/rbac/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

jest.mock('@/lib/hooks/queries/usePromotions', () => {
  const actual = jest.requireActual('@/lib/hooks/queries/usePromotions');
  return {
    ...actual,
    usePromotions: (...args: unknown[]) => mockUsePromotions(...args),
    useCreatePromotion: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUpdatePromotion: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useDeletePromotion: () => ({ mutateAsync: jest.fn(), isPending: false }),
  };
});

jest.mock('@/lib/hooks/queries/useMenu', () => ({
  useMenuCategories: (...args: unknown[]) => mockUseMenu(...args),
}));

jest.mock('@/lib/hooks/queries/useRestaurantSettings', () => ({
  useRestaurantSettings: (...args: unknown[]) => mockUseSettings(...args),
}));

const PromotionsPage = require('@/app/dashboard/promotions/page').default;

const authorisedRole = {
  hasPermission: (permission: string) => permission === 'promotions:manage',
  isLoading: false,
};

const menu = {
  data: [],
  isLoading: false,
  isError: false,
};

const settings = {
  data: { timezone: 'Asia/Kuala_Lumpur', currency: 'MYR' },
  isLoading: false,
  isError: false,
};

const promotion = {
  id: 'promo-1',
  name: 'Lunch 20%',
  receiptLabel: 'Lunch 20%',
  type: 'PERCENT',
  value: '20.00',
  scope: 'ORDER',
  categoryIds: [],
  itemIds: [],
  minSpend: '0.00',
  maxDiscount: '15.00',
  startsAt: '2026-11-01T00:00:00.000Z',
  endsAt: '2099-12-31T23:59:59.999Z',
  isActive: true,
  deletedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function renderPage() {
  return renderToStaticMarkup(<PromotionsPage />);
}

describe('PromotionsPage states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRole.mockReturnValue(authorisedRole);
    mockUseMenu.mockReturnValue(menu);
    mockUseSettings.mockReturnValue(settings);
    mockUsePromotions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders a permission-denied state', () => {
    mockUseRole.mockReturnValue({
      hasPermission: () => false,
      isLoading: false,
    });

    const markup = renderPage();

    expect(markup).toContain('owner-managed');
    expect(markup).toContain('promotions:manage');
    expect(markup).not.toContain('New promotion');
    expect(mockUsePromotions).toHaveBeenCalledWith({}, { enabled: false });
    expect(mockUseMenu).toHaveBeenCalledWith({ enabled: false });
    expect(mockUseSettings).toHaveBeenCalledWith({ enabled: false });
  });

  it('enables the queries once the permission resolves', () => {
    renderPage();

    expect(mockUsePromotions).toHaveBeenCalledWith({}, { enabled: true });
    expect(mockUseMenu).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseSettings).toHaveBeenCalledWith({ enabled: true });
  });

  it('renders the loading state', () => {
    mockUsePromotions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    expect(renderPage()).toContain('Loading promotions');
  });

  it('renders the error state with a retry action', () => {
    mockUsePromotions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Could not load promotions'),
      refetch: jest.fn(),
    });

    const markup = renderPage();

    expect(markup).toContain('Could not load promotions');
    expect(markup).toContain('Retry');
  });

  it('renders the empty state', () => {
    expect(renderPage()).toContain('No promotions yet');
  });

  it('renders the list from server values', () => {
    mockUsePromotions.mockReturnValue({
      data: [promotion],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const markup = renderPage();

    expect(markup).toContain('Lunch 20%');
    expect(markup).toContain('Whole order');
    expect(markup).toContain('Active');
    expect(markup).toContain('15.00');
  });
});
