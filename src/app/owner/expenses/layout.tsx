import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expenses | QR-Eat',
  description: 'Manage restaurant expenses and track spending',
};

export default function ExpensesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
