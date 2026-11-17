/**
 * Station print-mode copy and control.
 *
 * `jest-environment-node` has no DOM (and no jsdom environment is installed),
 * so the presentational control is rendered to static markup, matching the
 * existing dashboard page tests. Behaviour under test: the mode → label and
 * description mapping, the read fallback, the onboarding default, and the
 * non-blocking Counter reminder.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRINT_MODES } from '@/lib/station-settings';
import {
  COUNTER_PRINTER_REMINDER,
  DEFAULT_NEW_STATION_PRINT_MODE,
  FALLBACK_PRINT_MODE,
  PRINT_MODE_OPTIONS,
  normalizeStationPrintMode,
  printModeOption,
} from '@/components/stations/print-mode';
import { PrintModeField } from '@/components/stations/PrintModeField';

const noop = () => {};

describe('station print mode copy', () => {
  it('maps every server-owned mode to a label and a description', () => {
    expect(PRINT_MODE_OPTIONS.map((option) => option.value)).toEqual([
      ...PRINT_MODES,
    ]);

    for (const mode of PRINT_MODES) {
      const option = printModeOption(mode);
      expect(option.value).toBe(mode);
      expect(option.label.trim().length).toBeGreaterThan(0);
      expect(option.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('pins the approved plain-language guidance for all three modes', () => {
    expect(printModeOption('STATION').description).toBe(
      "The Kitchen device prints this station's tickets."
    );
    expect(printModeOption('COUNTER').description).toBe(
      "The Counter prints this station's tickets. No Kitchen device is required. Set up the Counter printer before service."
    );
    expect(printModeOption('NONE').description).toBe(
      'No paper. This station is display only. No Kitchen device is required.'
    );
  });

  it('reads a missing or invalid key as STATION', () => {
    expect(FALLBACK_PRINT_MODE).toBe('STATION');
    expect(normalizeStationPrintMode(undefined)).toBe('STATION');
    expect(normalizeStationPrintMode(null)).toBe('STATION');
    expect(normalizeStationPrintMode('')).toBe('STATION');
    expect(normalizeStationPrintMode('KITCHEN')).toBe('STATION');
    expect(normalizeStationPrintMode(42)).toBe('STATION');
  });

  it('keeps valid stored modes', () => {
    for (const mode of PRINT_MODES) {
      expect(normalizeStationPrintMode(mode)).toBe(mode);
    }
  });

  it('defaults new onboarding to COUNTER', () => {
    expect(DEFAULT_NEW_STATION_PRINT_MODE).toBe('COUNTER');
    expect(PRINT_MODES).toContain(DEFAULT_NEW_STATION_PRINT_MODE);
  });
});

describe('PrintModeField', () => {
  it('renders a labelled control with the current mode explanation', () => {
    const markup = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-test"
        value="NONE"
        savedValue="NONE"
        onChange={noop}
        onSave={noop}
      />
    );

    expect(markup).toContain('for="station-print-mode-test"');
    expect(markup).toContain('id="station-print-mode-test"');
    expect(markup).toContain('Print mode');
    expect(markup).toMatch(/<option value="NONE" selected/);
    expect(markup).toContain('No paper. This station is display only.');
    expect(markup).toContain(
      'aria-describedby="station-print-mode-test-description"'
    );
    expect(markup).toContain('Save print mode');
  });

  it('enables save only when the draft differs from the saved value', () => {
    const unchanged = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-unchanged"
        value="STATION"
        savedValue="STATION"
        onChange={noop}
        onSave={noop}
      />
    );
    const changed = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-changed"
        value="COUNTER"
        savedValue="STATION"
        onChange={noop}
        onSave={noop}
      />
    );

    expect(unchanged).toMatch(/<button[^>]*\sdisabled=""/);
    expect(changed).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it('shows the Counter reminder without claiming the printer is ready', () => {
    const markup = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-counter"
        value="COUNTER"
        savedValue="COUNTER"
        onChange={noop}
        onSave={noop}
      />
    );

    expect(markup).toContain(COUNTER_PRINTER_REMINDER);
    expect(markup).toContain('Set up the Counter printer before service.');
    expect(markup).not.toMatch(/printer is (ready|configured|set up)/i);
    expect(markup).not.toMatch(/IP address|port|credential|driver/i);
  });

  it('renders success and error save states with a live region role', () => {
    const success = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-success"
        value="NONE"
        savedValue="NONE"
        onChange={noop}
        onSave={noop}
        status={{ tone: 'success', message: 'Print mode saved.' }}
      />
    );
    const failure = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-error"
        value="STATION"
        savedValue="STATION"
        onChange={noop}
        onSave={noop}
        status={{
          tone: 'error',
          message:
            'Could not save the print mode. The last saved setting is still shown. Try again.',
        }}
      />
    );

    expect(success).toContain('role="status"');
    expect(success).toContain('Print mode saved.');
    expect(failure).toContain('role="alert"');
    expect(failure).toContain('The last saved setting is still shown.');
    expect(failure).toContain(
      'aria-describedby="station-print-mode-error-description station-print-mode-error-status"'
    );
  });

  it('announces a save in progress', () => {
    const markup = renderToStaticMarkup(
      <PrintModeField
        id="station-print-mode-saving"
        value="NONE"
        savedValue="STATION"
        onChange={noop}
        onSave={noop}
        saving
      />
    );

    expect(markup).toContain('Saving print mode...');
    expect(markup).toMatch(/<select[^>]*\sdisabled=""/);
    expect(markup).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it('renders the create form without a save button', () => {
    const markup = renderToStaticMarkup(
      <PrintModeField
        id="new-station-print-mode"
        value={DEFAULT_NEW_STATION_PRINT_MODE}
        onChange={noop}
      />
    );

    expect(markup).toMatch(/<option value="COUNTER" selected/);
    expect(markup).toContain('The Counter prints this station&#x27;s tickets.');
    expect(markup).toContain(COUNTER_PRINTER_REMINDER);
    expect(markup).not.toContain('Save print mode');
  });
});
