'use client';

import React, { useState } from 'react';
import { ChevronDown, CheckCircle } from 'lucide-react';

interface AccordionItemProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isRequired?: boolean;
  isCompleted?: boolean;
  error?: string;
}

export function AccordionItem({
  title,
  subtitle,
  children,
  defaultOpen = false,
  isRequired = false,
  isCompleted = false,
  error,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`
            border rounded-xl transition-all duration-300 overflow-hidden
            ${
              error
                ? 'border-red-300 bg-red-50/30'
                : isCompleted
                  ? 'border-green-200 bg-green-50/30'
                  : 'border-gray-200 bg-white'
            }
        `}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left group"
      >
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-2">
            <h3
              className={`font-bold text-gray-900 ${error ? 'text-red-700' : ''}`}
            >
              {title}
            </h3>
            {isRequired && !isCompleted && (
              <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Required
              </span>
            )}
            {isCompleted && (
              <CheckCircle
                size={16}
                className="text-green-500 fill-green-100"
              />
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5 font-medium">
              {subtitle}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 mt-1 font-bold animate-pulse">
              {error}
            </p>
          )}
        </div>

        <div
          className={`
            p-1 rounded-full transition-transform duration-300
            ${isOpen ? 'rotate-180 bg-gray-100' : 'rotate-0 group-hover:bg-gray-50'}
        `}
        >
          <ChevronDown
            size={20}
            className="text-gray-400 group-hover:text-gray-600"
          />
        </div>
      </button>

      <div
        className={`
            transition-all duration-300 ease-in-out
            ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className="p-4 pt-0 border-t border-gray-100/50">{children}</div>
      </div>
    </div>
  );
}
