/**
 * Payment settings section: cash rounding control and PUT contract.
 *
 * Node environment, so the component is rendered to static markup with
 * TanStack Query mocked. The mutation config is inspected directly.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({ defaultOptions: {} })),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

import { ApiClient } from '@/lib/api-client';
import { PaymentMethodsSection } from '@/components/settings/PaymentMethodsSection';

const initialData = {
  paymentMethods: { cash: true, card: true, ewallet: true },
};

function renderSection() {
  return renderToStaticMarkup(
    <PaymentMethodsSection initialData={initialData} onUpdate={() => {}} />
  );
}

describe('PaymentMethodsSection cash rounding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: {
        paymentMethods: { cash: true, card: true, ewallet: true },
        cashRounding: 'NEAREST_5_SEN',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseMutation.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
  });

  it('renders the cash-rounding control independently of rewards', () => {
    const markup = renderSection();

    expect(markup).toContain('Cash rounding');
    expect(markup).toContain('No rounding');
    expect(markup).toContain('Round cash to nearest 5 sen');
    expect(markup).toContain('independent of rewards');
    expect(markup).not.toContain('Enable rewards');
  });

  it('sends cashRounding in the PUT body with an Idempotency-Key', async () => {
    renderSection();

    const config = mockUseMutation.mock.calls[0]?.[0];
    const payload = {
      paymentMethods: { cash: true, card: false, ewallet: true },
      cashRounding: 'NEAREST_5_SEN',
    };

    await config.mutationFn(payload);

    expect(ApiClient.put).toHaveBeenCalledTimes(1);
    const [endpoint, body, options] = (ApiClient.put as jest.Mock).mock
      .calls[0];
    expect(endpoint).toBe('/settings/restaurant/payments');
    expect(body).toEqual(payload);
    expect(body.cashRounding).toBe('NEAREST_5_SEN');
    expect(options.headers['Idempotency-Key']).toBeTruthy();
  });

  it('uses high-contrast success and error banner text (L-01)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/settings/PaymentMethodsSection.tsx'),
      'utf8'
    );

    expect(source).toContain('text-green-700');
    expect(source).not.toContain('text-green-600');
    expect(source).toContain('text-red-700');
    expect(source).not.toContain('text-red-600');
  });
});
