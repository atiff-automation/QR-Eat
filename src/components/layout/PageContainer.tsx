'use client';

import { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Reusable page container for QR ordering flow
 * Provides consistent white card styling with shadow and rounded corners
 */
export function PageContainer({
  children,
  className = '',
}: PageContainerProps) {
  return (
    <div className="min-h-screen bg-gray-50 py-4">
      <div className={`max-w-2xl mx-auto px-4 ${className}`}>
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
