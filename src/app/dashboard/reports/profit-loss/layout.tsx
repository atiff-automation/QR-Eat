import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profit & Loss Report | QR-Eat',
  description: 'View profit and loss report for your restaurant',
};

export default function ProfitLossLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
