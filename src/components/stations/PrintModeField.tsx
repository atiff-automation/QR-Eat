'use client';

/**
 * Station print-mode control (`phase-b-print-v1` §4).
 *
 * Presentational: the page owns loading, saving and the server response. The
 * select only offers the server-owned enum values, so the server stays the
 * authority for what is valid. No printer address, driver or credential is
 * collected or shown here.
 */

import { AlertTriangle, CheckCircle2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PrintMode } from '@/lib/station-settings';
import {
  COUNTER_PRINTER_REMINDER,
  PRINT_MODE_OPTIONS,
  printModeOption,
} from './print-mode';

export interface PrintModeStatusMessage {
  tone: 'success' | 'error';
  message: string;
}

interface PrintModeFieldProps {
  /** Used for the label association and the description/status ids. */
  id: string;
  value: PrintMode;
  onChange: (mode: PrintMode) => void;
  /** Last value the server confirmed. Omit for the create form. */
  savedValue?: PrintMode;
  /** Renders the save button and, with `savedValue`, its dirty check. */
  onSave?: () => void;
  saving?: boolean;
  disabled?: boolean;
  status?: PrintModeStatusMessage | null;
}

export function PrintModeField({
  id,
  value,
  onChange,
  savedValue,
  onSave,
  saving = false,
  disabled = false,
  status = null,
}: PrintModeFieldProps) {
  const option = printModeOption(value);
  const descriptionId = `${id}-description`;
  const statusId = `${id}-status`;
  const dirty = savedValue !== undefined && savedValue !== value;
  const describedBy = status ? `${descriptionId} ${statusId}` : descriptionId;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
      >
        Print mode
      </label>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          id={id}
          value={value}
          onChange={(event) => {
            const next = PRINT_MODE_OPTIONS.find(
              (item) => item.value === event.target.value
            );
            if (next) onChange(next.value);
          }}
          disabled={disabled || saving}
          aria-describedby={describedBy}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:max-w-xs"
        >
          {PRINT_MODE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        {onSave && (
          <Button
            variant="outline"
            className="whitespace-nowrap"
            onClick={onSave}
            disabled={!dirty || disabled}
            loading={saving}
          >
            Save print mode
          </Button>
        )}
      </div>

      <p id={descriptionId} className="mt-2 text-xs text-gray-600">
        {option.description}
      </p>

      {saving && !status && (
        <p role="status" className="mt-2 text-xs text-gray-600">
          Saving print mode...
        </p>
      )}

      {value === 'COUNTER' && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Printer
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
          />
          <span>{COUNTER_PRINTER_REMINDER}</span>
        </p>
      )}

      {status && (
        <p
          id={statusId}
          role={status.tone === 'error' ? 'alert' : 'status'}
          className={`mt-2 flex items-start gap-2 text-xs ${
            status.tone === 'error' ? 'text-red-700' : 'text-green-700'
          }`}
        >
          {status.tone === 'error' ? (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
            />
          ) : (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
            />
          )}
          <span>{status.message}</span>
        </p>
      )}
    </div>
  );
}
