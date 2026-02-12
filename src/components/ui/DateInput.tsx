'use client';

import React from 'react';
import DatePicker from 'react-datepicker';
import { parse, format, isValid } from 'date-fns';
import '@/styles/datepicker.css';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  maxDate?: Date;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * DateInput — consistent DD/MM/YYYY date picker across all browsers.
 * Accepts and emits YYYY-MM-DD strings (same format as native date inputs).
 */
export function DateInput({
  value,
  onChange,
  className = '',
  maxDate,
  placeholder = 'dd/mm/yyyy',
  disabled = false,
}: DateInputProps) {
  const selectedDate = React.useMemo(() => {
    if (!value) return null;
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : null;
  }, [value]);

  const handleChange = (date: Date | null) => {
    if (date && isValid(date)) {
      onChange(format(date, 'yyyy-MM-dd'));
    } else {
      onChange('');
    }
  };

  return (
    <DatePicker
      selected={selectedDate}
      onChange={handleChange}
      dateFormat="dd/MM/yyyy"
      maxDate={maxDate}
      placeholderText={placeholder}
      disabled={disabled}
      className={`w-full ${className}`}
      autoComplete="off"
    />
  );
}
