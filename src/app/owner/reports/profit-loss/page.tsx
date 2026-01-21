'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profit & Loss Report | QR-Eat',
  description: 'View profit and loss report for your restaurant',
};

export default function ProfitLossReportPage() {
  const { user, isLoading: authLoading } = useAuth();

  // Handle authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user || !user.restaurantId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You must be logged in to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Profit & Loss Report
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="text-center text-gray-600 py-12">
          P&L Report content coming soon...
          <br />
          <span className="text-sm text-gray-500">
            Restaurant ID: {user.restaurantId}
          </span>
        </div>
      </div>
    </div>
  );
}
