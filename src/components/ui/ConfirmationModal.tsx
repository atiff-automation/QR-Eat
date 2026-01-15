import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isLoading = false,
  variant = 'danger',
  confirmText = 'Delete',
  cancelText = 'Cancel',
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: 'text-red-600 bg-red-100',
          button: 'bg-red-600 hover:bg-red-700 text-white',
        };
      case 'warning':
        return {
          icon: 'text-amber-600 bg-amber-100',
          button: 'bg-amber-600 hover:bg-amber-700 text-white',
        };
      case 'info':
        return {
          icon: 'text-blue-600 bg-blue-100',
          button: 'bg-blue-600 hover:bg-blue-700 text-white',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden transform transition-all scale-100 opacity-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className={`p-3 rounded-full ${styles.icon}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 id="modal-title" className="text-lg font-bold text-gray-900">
                {title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-gray-700 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2.5 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${styles.button}`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
