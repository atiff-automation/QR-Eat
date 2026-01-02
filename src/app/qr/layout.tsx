/**
 * QR Ordering Layout
 *
 * Applies mobile-only view to customer ordering pages.
 *
 * Features:
 * - Fixed 414px centered container on desktop
 * - Zoom disabled for consistent mobile experience (via viewport in page.tsx)
 * - Gray background with white content frame
 * - Full width on actual mobile devices
 */

import { MobileFrameLayout } from '@/components/layout/MobileFrameLayout';

interface QRLayoutProps {
  children: React.ReactNode;
}

export default function QRLayout({ children }: QRLayoutProps) {
  return <MobileFrameLayout>{children}</MobileFrameLayout>;
}
