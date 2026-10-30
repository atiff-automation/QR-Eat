import Link from 'next/link';
import {
  ClipboardList,
  FileText,
  TrendingUp,
  Monitor,
  ChefHat,
  Receipt,
} from 'lucide-react';

const reportCards = [
  {
    href: '/dashboard/reports/daily',
    icon: ClipboardList,
    iconClassName: 'bg-blue-100 text-blue-600',
    title: 'Daily Sales',
    description:
      'Business-day sales, orders, payments and refunds in one view.',
  },
  {
    href: '/dashboard/reports/z',
    icon: FileText,
    iconClassName: 'bg-slate-100 text-slate-700',
    title: 'Z Reports',
    description: 'Close-day snapshots and printable end-of-day reports.',
  },
  {
    href: '/dashboard/reports/profit-loss',
    icon: TrendingUp,
    iconClassName: 'bg-emerald-100 text-emerald-600',
    title: 'Profit & Loss',
    description: 'Revenue, COGS, operating expenses and net profit.',
  },
];

const quickActions = [
  {
    href: '/dashboard/orders/live',
    icon: Monitor,
    className: 'bg-blue-600 hover:bg-blue-700',
    label: 'Live Order Board',
  },
  {
    href: '/dashboard/reports/daily',
    icon: ClipboardList,
    className: 'bg-indigo-600 hover:bg-indigo-700',
    label: 'Daily Sales',
  },
  {
    href: '/dashboard/reports/z',
    icon: FileText,
    className: 'bg-slate-800 hover:bg-slate-900',
    label: 'Z Reports',
  },
  {
    href: '/dashboard/kitchen',
    icon: ChefHat,
    className: 'bg-green-600 hover:bg-green-700',
    label: 'Kitchen Display',
  },
  {
    href: '/dashboard/expenses',
    icon: Receipt,
    className: 'bg-amber-600 hover:bg-amber-700',
    label: 'Expenses',
  },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-gray-600">
          Daily sales, Z reports and profit &amp; loss for your restaurant.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {reportCards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center mb-4">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconClassName}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="ml-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {card.title}
                  </h2>
                </div>
              </div>
              <p className="text-sm text-gray-600">{card.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;

            return (
              <Link
                key={action.href}
                href={action.href}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${action.className}`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
