/**
 * Public Receipt Page
 *
 * Customer-facing receipt page accessible via QR code
 * Server-side rendered for performance
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Error Handling
 * - Mobile-First Design
 */

import { notFound } from 'next/navigation';
import type { PublicReceiptData } from '@/types/pos';
import { PublicReceiptView } from '@/components/receipt/PublicReceiptView';

interface PageProps {
  params: Promise<{
    restaurantId: string;
    receiptNumber: string;
  }>;
}

async function fetchReceipt(
  restaurantId: string,
  receiptNumber: string
): Promise<PublicReceiptData | null> {
  try {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const response = await fetch(
      `${baseUrl}/api/receipt/${restaurantId}/${receiptNumber}`,
      {
        cache: 'no-store', // Always fetch fresh data
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.receipt;
  } catch (error) {
    console.error('Error fetching receipt:', error);
    return null;
  }
}

export default async function ReceiptPage({ params }: PageProps) {
  const { restaurantId, receiptNumber } = await params;

  const receipt = await fetchReceipt(restaurantId, receiptNumber);

  if (!receipt) {
    notFound();
  }

  return <PublicReceiptView receipt={receipt} />;
}

// Metadata for SEO
export async function generateMetadata({ params }: PageProps) {
  const { receiptNumber } = await params;

  return {
    title: `Receipt ${receiptNumber}`,
    description: 'Digital receipt copy',
    robots: 'noindex, nofollow', // Don't index receipt pages
  };
}
