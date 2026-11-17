/**
 * Owner-facing copy for a station's print mode (`phase-b-print-v1` §4).
 *
 * The enum and the server normalizer live in `src/lib/station-settings.ts`.
 * This module only maps the server-owned values to UI labels, approved
 * plain-language guidance and the onboarding default. It must not invent a
 * print rule: the server decides what each mode means and rejects values it
 * does not accept.
 */

import { isPrintMode, type PrintMode } from '@/lib/station-settings';

export interface PrintModeOption {
  value: PrintMode;
  /** Short label used inside the select. */
  label: string;
  /** One-line plain-language explanation shown under the control. */
  description: string;
}

/**
 * Approved B1-W wording. Do not paraphrase into printer/device claims: the
 * server does not know whether a Counter printer exists or is ready.
 */
export const PRINT_MODE_OPTIONS: readonly PrintModeOption[] = [
  {
    value: 'STATION',
    label: 'Kitchen device prints',
    description: "The Kitchen device prints this station's tickets.",
  },
  {
    value: 'COUNTER',
    label: 'Counter prints',
    description:
      "The Counter prints this station's tickets. No Kitchen device is required. Set up the Counter printer before service.",
  },
  {
    value: 'NONE',
    label: 'No paper (display only)',
    description:
      'No paper. This station is display only. No Kitchen device is required.',
  },
];

/**
 * Non-blocking reminder. It is deliberately phrased as an instruction, never
 * as a readiness or configured claim.
 */
export const COUNTER_PRINTER_REMINDER =
  'Set up the Counter printer before service. The dashboard cannot check whether it is ready.';

/** New onboarding writes `COUNTER` (§4.2). */
export const DEFAULT_NEW_STATION_PRINT_MODE: PrintMode = 'COUNTER';

/** A missing or unknown key keeps existing Kitchen printing (§4.2). */
export const FALLBACK_PRINT_MODE: PrintMode = 'STATION';

/**
 * Mirrors the server's read fallback so a station row that predates
 * `printMode` displays `STATION`. The server remains authoritative; this only
 * decides what the owner sees before the first save.
 */
export function normalizeStationPrintMode(value: unknown): PrintMode {
  return isPrintMode(value) ? value : FALLBACK_PRINT_MODE;
}

export function printModeOption(value: PrintMode): PrintModeOption {
  return (
    PRINT_MODE_OPTIONS.find((item) => item.value === value) ??
    PRINT_MODE_OPTIONS[0]
  );
}
