'use client';

import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface StatCardProps {
  title: string;
  value: string | number | React.ReactNode;
  subtitle?: string;
  icon: LucideIcon;
  href: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  badgeCount?: number;
  alert?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
  color,
  badgeCount,
  alert,
}: StatCardProps) {
  const colorStyles = {
    blue: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
    green: 'bg-green-50 text-green-600 group-hover:bg-green-100',
    purple: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
    orange: 'bg-orange-50 text-orange-600 group-hover:bg-orange-100',
    red: 'bg-red-50 text-red-600 group-hover:bg-red-100',
  };

  return (
    <Link
      href={href}
      className={`group bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full relative ${
        alert
          ? 'border-orange-400 ring-2 ring-orange-100 animate-pulse'
          : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`p-2.5 rounded-lg transition-colors ${colorStyles[color]}`}
        >
          <Icon className="w-6 h-6" />
        </div>

        {badgeCount !== undefined && badgeCount > 0 && (
          <div className="flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full shadow-sm animate-bounce">
            {badgeCount > 99 ? '99+' : badgeCount}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}
