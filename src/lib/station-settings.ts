/**
 * Station policy/presentation settings.
 *
 * Stored as JSON on the station so the owner can change policy without an app
 * release. Values are normalized on read so old/partial rows are safe.
 */

/**
 * Station print authority (`phase-b-print-v1` §4.1):
 * - `STATION`: the paired Kitchen/Station device prints over its LAN printer.
 * - `COUNTER`: Counter staff print from the Counter session.
 * - `NONE`: KDS only; nothing prints.
 *
 * Missing/invalid values normalize to `STATION` so an existing station keeps
 * its Kitchen printing behaviour. New stations are written with `COUNTER` by
 * the station-create route (§4.2).
 */
export const PRINT_MODES = ['STATION', 'COUNTER', 'NONE'] as const;
export type PrintMode = (typeof PRINT_MODES)[number];

export function isPrintMode(value: unknown): value is PrintMode {
  return value === 'STATION' || value === 'COUNTER' || value === 'NONE';
}

export interface StationSettings {
  warnMinutes: number;
  lateMinutes: number;
  density: 'compact' | 'normal';
  textScale: 'small' | 'normal' | 'large';
  printMode: PrintMode;
}

export const DEFAULT_STATION_SETTINGS: StationSettings = {
  warnMinutes: 5,
  lateMinutes: 10,
  density: 'normal',
  textScale: 'normal',
  printMode: 'STATION',
};

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function normalizeStationSettings(value: unknown): StationSettings {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const warnMinutes = integer(
    source.warnMinutes,
    DEFAULT_STATION_SETTINGS.warnMinutes,
    1,
    120
  );
  const lateMinutes = Math.max(
    warnMinutes + 1,
    integer(source.lateMinutes, DEFAULT_STATION_SETTINGS.lateMinutes, 2, 180)
  );

  return {
    warnMinutes,
    lateMinutes,
    density: source.density === 'compact' ? 'compact' : 'normal',
    textScale:
      source.textScale === 'small' || source.textScale === 'large'
        ? source.textScale
        : 'normal',
    printMode: isPrintMode(source.printMode) ? source.printMode : 'STATION',
  };
}

export function mergeStationSettings(
  current: unknown,
  patch: unknown
): StationSettings {
  const base = normalizeStationSettings(current);
  const next =
    patch && typeof patch === 'object'
      ? (patch as Record<string, unknown>)
      : {};
  return normalizeStationSettings({ ...base, ...next });
}
