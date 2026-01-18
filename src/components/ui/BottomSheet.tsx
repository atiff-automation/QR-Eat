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
  showCloseButtonOverlay?: boolean;
  noPadding?: boolean;
  hideDragHandle?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  showCloseButtonOverlay,
  noPadding,
  hideDragHandle,
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
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto ${isClosing || !isOpen ? 'animate-fade-out' : 'animate-fade-in'
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
          max-h-[96vh] sm:max-h-[95vh]
          ${isClosing || !isOpen ? 'animate-slide-down' : 'animate-slide-up'}
        `}
      >
        {/* Drag Handle (Mobile Visual Only) */}
        {!hideDragHandle && (
          <div className="w-full h-1.5 flex justify-center pt-2 pb-1 sm:hidden shrink-0">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>
        )}

        {/* Header */}
        {title ? (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        ) : showCloseButtonOverlay ? (
          <button
            onClick={onClose}
            className="absolute right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors z-20"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
          >
            <X size={20} className="text-gray-600" />
          </button>
        ) : null}

        {/* Content - Scrollable */}
        <div
          className={`flex-1 overflow-y-auto content-box overscroll-contain ${noPadding ? '' : 'p-4'}`}
        >
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
