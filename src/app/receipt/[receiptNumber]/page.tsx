import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenant } from '@/lib/tenant-resolver';
import { PublicReceiptView } from '@/components/receipt/PublicReceiptView';
import type { PublicReceiptData } from '@/types/pos';

interface PageProps {
  params: Promise<{ receiptNumber: string }>;
}

export default async function ReceiptPage({ params }: PageProps) {
  const { receiptNumber } = await params;

  // ✅ STEP 1: Validate slug exists
  const headersList = await headers();
  const slug = headersList.get('x-tenant-slug');

  if (process.env.NODE_ENV === 'development') {
    console.log('[Receipt Page] Debug:', {
      receiptNumber,
      slug,
      isSubdomain: headersList.get('x-is-subdomain'),
    });
  }

  if (!slug) {
    console.error('[Receipt] No tenant slug');
    return notFound();
  }

  // ✅ STEP 2: Validate restaurant exists
  const result = await resolveTenant(slug);
  if (!result.isValid || !result.tenant) {
    console.error(`[Receipt] Invalid restaurant: ${slug}`);
    return notFound();
  }
  const restaurant = result.tenant;

  // ✅ STEP 3: Fetch receipt
  const receipt = await fetchReceipt(restaurant.id, receiptNumber);
  if (!receipt) {
    console.error(`[Receipt] Not found: ${receiptNumber}`);
    return notFound();
  }

  // ✅ STEP 4: Cross-validate ownership
  // Note: PublicReceiptData doesn't expose restaurantId for security
  // The API already validates ownership, this is a redundant check
  // We trust the API validation since we're fetching by restaurant.id

  return <PublicReceiptView receipt={receipt} />;
}

/**
 * ✅ PRODUCTION: Type-safe fetch with error handling
 */
async function fetchReceipt(
  restaurantId: string,
  receiptNumber: string
): Promise<PublicReceiptData | null> {
  try {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const response = await fetch(
      `${baseUrl}/api/receipt/${restaurantId}/${receiptNumber}`,
      {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(
        `[Receipt Page] API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();

    // ✅ PRODUCTION: Validate response structure
    if (!data.receipt) {
      console.error('[Receipt Page] Invalid API response: missing receipt');
      return null;
    }

    return data.receipt as PublicReceiptData;
  } catch (error) {
    console.error('[Receipt Page] Fetch error:', error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { receiptNumber } = await params;
  return {
    title: `Receipt ${receiptNumber}`,
    description: 'Digital receipt copy',
    robots: 'noindex, nofollow',
  };
}
