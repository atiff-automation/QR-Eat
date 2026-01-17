'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: BottomSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle body scroll lock
  useBodyScrollLock(isOpen);

  // Handle mount/unmount animations
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 300); // Match transition duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  if (!shouldRender) return null;

  const content = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center pointer-events-none">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto ${
          isClosing || !isOpen ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet / Modal */}
      <div
        className={`
          pointer-events-auto
          relative w-full max-w-lg bg-white 
          rounded-t-2xl sm:rounded-2xl 
          shadow-2xl overflow-hidden 
          flex flex-col
          max-h-[90vh] sm:max-h-[85vh]
          transition-transform duration-300 cubic-bezier(0.32, 0.72, 0, 1)
          ${isClosing || !isOpen ? 'translate-y-full sm:translate-y-12 sm:opacity-0' : 'translate-y-0 sm:translate-y-0 sm:opacity-100'}
        `}
      >
        {/* Drag Handle (Mobile Visual Only) */}
        <div className="w-full h-1.5 flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 content-box overscroll-contain">
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <div className="border-t border-gray-100 p-4 bg-white shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Render to body/portal to avoid z-index stacking context issues
  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
}
