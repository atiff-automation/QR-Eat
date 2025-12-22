/**
 * Loading Spinner Component
 *
 * Reusable loading indicator following CLAUDE.md principles:
 * - Single Source of Truth for loading UI patterns
 * - Type-safe with explicit props
 * - Consistent styling across application
 * - Accessibility compliant (ARIA labels)
 *
 * @see CLAUDE.md - Coding Standards: DRY, Component Reusability
 */

'use client';

interface LoadingSpinnerProps {
  /** Display message below the spinner */
  message?: string;
  /** Size variant for different contexts */
  size?: 'sm' | 'md' | 'lg';
  /** Full-screen overlay vs inline display */
  fullScreen?: boolean;
  /** Custom CSS class for additional styling */
  className?: string;
}

export function LoadingSpinner({
  message = 'Loading...',
  size = 'md',
  fullScreen = false,
  className = '',
}: LoadingSpinnerProps) {
  // Size mappings following design system
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const spinner = (
    <div className={`text-center ${className}`}>
      <div
        className={`animate-spin rounded-full ${sizeClasses[size]} border-b-2 border-blue-600 mx-auto mb-4`}
        role="status"
        aria-label="Loading"
      />
      {message && (
        <p className={`text-gray-600 ${textSizeClasses[size]}`}>{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        {spinner}
      </div>
    );
  }

  return spinner;
}
