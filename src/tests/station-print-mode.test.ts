import {
  DEFAULT_STATION_SETTINGS,
  PRINT_MODES,
  isPrintMode,
  mergeStationSettings,
  normalizeStationSettings,
} from '@/lib/station-settings';

describe('station printMode normalization (§4.2)', () => {
  it('defaults a missing, null or invalid value to STATION', () => {
    expect(normalizeStationSettings({}).printMode).toBe('STATION');
    expect(normalizeStationSettings({ printMode: null }).printMode).toBe(
      'STATION'
    );
    expect(normalizeStationSettings({ printMode: 'PRINTER' }).printMode).toBe(
      'STATION'
    );
    expect(normalizeStationSettings({ printMode: 3 }).printMode).toBe(
      'STATION'
    );
    expect(normalizeStationSettings(null).printMode).toBe('STATION');
  });

  it('passes every valid value through', () => {
    for (const mode of PRINT_MODES) {
      expect(normalizeStationSettings({ printMode: mode }).printMode).toBe(
        mode
      );
    }
  });

  it('keeps STATION in the default object, not the onboarding default', () => {
    expect(DEFAULT_STATION_SETTINGS.printMode).toBe('STATION');
    expect(isPrintMode('COUNTER')).toBe(true);
    expect(isPrintMode('counter')).toBe(false);
  });

  it('preserves the current mode when a patch omits it', () => {
    const merged = mergeStationSettings(
      { printMode: 'NONE', warnMinutes: 7 },
      { lateMinutes: 20 }
    );
    expect(merged.printMode).toBe('NONE');
    expect(merged.warnMinutes).toBe(7);
    expect(merged.lateMinutes).toBe(20);
  });

  it('applies a valid mode patch and normalizes an invalid one', () => {
    expect(
      mergeStationSettings({ printMode: 'STATION' }, { printMode: 'COUNTER' })
        .printMode
    ).toBe('COUNTER');
    // Route validation rejects this first; normalization must still be safe.
    expect(
      mergeStationSettings({ printMode: 'COUNTER' }, { printMode: 'BOGUS' })
        .printMode
    ).toBe('STATION');
  });
});
