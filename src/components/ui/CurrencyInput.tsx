import React, { useRef } from 'react';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}

/**
 * CurrencyInput
 *
 * A production-ready input component for financial values.
 * Implements "Fixed Decimal" / "Cents Entry" logic:
 * - Typing digits shifts values in from the right (1 -> 0.01, 12 -> 0.12, 123 -> 1.23).
 * - Eliminates floating point ambiguity during entry.
 * - Formats automatically as currency.
 * - Uses inputMode="numeric" for mobile keypads.
 */
export function CurrencyInput({
  value,
  onChange,
  currency = 'MYR',
  className = '',
  placeholder,
  disabled = false,
  required = false,
  autoFocus = false,
}: CurrencyInputProps) {
  // Ref to the input element
  const inputRef = useRef<HTMLInputElement>(null);

  // Format the current value for display
  const formatValue = (val: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Get the raw input value
    const inputValue = e.target.value;

    // Remove non-numeric characters (keep only digits)
    // We treat the input as a stream of digits for the "cents" value
    const digits = inputValue.replace(/\D/g, '');

    // If empty, set to 0
    if (digits === '') {
      onChange(0);
      return;
    }

    // Parse as integer (cents)
    const cents = parseInt(digits, 10);

    // Convert to float (dollars/ringgit)
    const floatValue = cents / 100;

    // Use a clamp if necessary, currently unbounded
    onChange(floatValue);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value === 0 ? '' : formatValue(value)}
        onChange={handleChange}
        className={`w-full ${className}`}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        aria-label="Price input"
      />
    </div>
  );
}
