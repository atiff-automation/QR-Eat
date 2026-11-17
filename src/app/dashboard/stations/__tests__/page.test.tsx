/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Stations page print-mode entry points.
 *
 * `jest-environment-node` has no DOM, so the page is rendered to static markup
 * with `useRole` mocked. Effects do not run during SSR; these assertions cover
 * the existing owner gate and the create-form default/guidance.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseRole = jest.fn();

jest.mock('@/components/rbac/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

const StationsPage = require('@/app/dashboard/stations/page').default;

function role(hasSettings: boolean) {
  return {
    hasPermission: (permission: string) =>
      hasSettings && permission === 'restaurant:settings',
    isLoading: false,
  };
}

describe('StationsPage print mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRole.mockReturnValue(role(true));
  });

  it('keeps the owner-only gate for restaurant:settings', () => {
    mockUseRole.mockReturnValue(role(false));

    const markup = renderToStaticMarkup(<StationsPage />);

    expect(markup).toContain('Owner access required');
    expect(markup).not.toContain('Create station');
    expect(markup).not.toContain('Print mode');
  });

  it('defaults the create form to Counter and explains the setup step', () => {
    const markup = renderToStaticMarkup(<StationsPage />);

    expect(markup).toContain('Create station');
    expect(markup).toContain('for="new-station-print-mode"');
    expect(markup).toMatch(/<option value="COUNTER" selected/);
    expect(markup).toContain('The Counter prints this station');
    expect(markup).toContain('No Kitchen device is required.');
    expect(markup).toContain('Set up the Counter printer before service.');
    expect(markup).not.toMatch(/printer is (ready|configured)/i);
  });

  it('marks the page busy and shows loading statuses instead of empty states', () => {
    const markup = renderToStaticMarkup(<StationsPage />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading stations...');
    expect(markup).toContain('Loading devices...');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('No stations yet.');
    expect(markup).not.toContain('No devices yet.');
  });

  it('explains the print mode in the page intro', () => {
    const markup = renderToStaticMarkup(<StationsPage />);

    expect(markup).toContain(
      'Its print mode decides whether the Kitchen device, the Counter, or nobody prints'
    );
  });
});
