import React from 'react';
import { Plus } from 'lucide-react';

interface FloatingActionButtonProps {
  onClick: () => void;
  icon?: React.ElementType; // Allow custom icon, default to Plus
  ariaLabel?: string;
  className?: string; // Allow extra styling if needed
}

export function FloatingActionButton({
  onClick,
  icon: Icon = Plus,
  ariaLabel = 'Add',
  className = '',
}: FloatingActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 right-6 h-14 w-14 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 z-20 ${className}`}
      aria-label={ariaLabel}
    >
      <Icon className="h-7 w-7" />
    </button>
  );
}
