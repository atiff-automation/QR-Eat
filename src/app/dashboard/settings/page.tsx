/**
 * Restaurant Settings Page
 * Main settings page with sidebar navigation (desktop) and tabs (mobile)
 */

'use client';

import { useState } from 'react';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { useRestaurantSettings } from '@/lib/hooks/queries/useRestaurantSettings';
import {
  Building2,
  Clock,
  DollarSign,
  Bell,
  CreditCard,
  Receipt,
  Settings2,
} from 'lucide-react';

// Import section components
import { GeneralSection } from '@/components/settings/GeneralSection';
import { OperatingHoursSection } from '@/components/settings/OperatingHoursSection';
import { FinancialSection } from '@/components/settings/FinancialSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { PaymentMethodsSection } from '@/components/settings/PaymentMethodsSection';
import { ReceiptSection } from '@/components/settings/ReceiptSection';
import { SystemPreferencesSection } from '@/components/settings/SystemPreferencesSection';
import { SettingsLoadingSkeleton } from '@/components/settings/SettingsLoadingSkeleton';

type SectionKey =
  | 'general'
  | 'hours'
  | 'financial'
  | 'notifications'
  | 'payments'
  | 'receipt'
  | 'system';

interface SettingsData {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  description?: string;
  timezone: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  taxLabel: string;
  serviceChargeLabel: string;
  operatingHours: {
    monday: { isOpen: boolean; slots: { open: string; close: string }[] };
    tuesday: { isOpen: boolean; slots: { open: string; close: string }[] };
    wednesday: { isOpen: boolean; slots: { open: string; close: string }[] };
    thursday: { isOpen: boolean; slots: { open: string; close: string }[] };
    friday: { isOpen: boolean; slots: { open: string; close: string }[] };
    saturday: { isOpen: boolean; slots: { open: string; close: string }[] };
    sunday: { isOpen: boolean; slots: { open: string; close: string }[] };
  };
  notificationSettings: {
    orderAlerts: boolean;
    soundEnabled: boolean;
    soundType: 'chime' | 'bell' | 'ding' | 'silent';
    desktopNotifications: boolean;
  };
  receiptSettings: {
    headerText: string;
    footerText: string;
    paperSize: '80mm';
  };
  paymentMethods: {
    cash: boolean;
    card: boolean;
    ewallet: boolean;
  };
  systemPreferences: {
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    timeFormat: '24h' | '12h';
    language: 'en' | 'ms' | 'zh';
  };
}

const SECTIONS = [
  {
    key: 'general' as SectionKey,
    label: 'General',
    icon: Building2,
  },
  {
    key: 'hours' as SectionKey,
    label: 'Operating Hours',
    icon: Clock,
  },
  {
    key: 'financial' as SectionKey,
    label: 'Financial',
    icon: DollarSign,
  },
  {
    key: 'notifications' as SectionKey,
    label: 'Notifications',
    icon: Bell,
  },
  {
    key: 'payments' as SectionKey,
    label: 'Payment Methods',
    icon: CreditCard,
  },
  {
    key: 'receipt' as SectionKey,
    label: 'Receipt',
    icon: Receipt,
  },
  {
    key: 'system' as SectionKey,
    label: 'System',
    icon: Settings2,
  },
];

function SettingsContent() {
  const [activeSection, setActiveSection] = useState<SectionKey>('general');
  const {
    data: settings,
    isLoading,
    isError,
    error,
    refetch,
  } = useRestaurantSettings();

  if (isLoading) {
    return <SettingsLoadingSkeleton />;
  }

  if (isError || !settings) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-md w-full text-center">
          <p className="text-red-600 mb-4">
            {error instanceof Error ? error.message : 'Failed to load settings'}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Transform hook data to UI data safely
  // This validates numbers and handles defaults
  const uiSettings: SettingsData = {
    id: settings.id,
    name: settings.name,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    description: settings.description || undefined,
    timezone: settings.timezone,
    currency: settings.currency,
    taxRate: parseFloat(settings.taxRate) || 0,
    serviceChargeRate: parseFloat(settings.serviceChargeRate) || 0,
    taxLabel: settings.taxLabel,
    serviceChargeLabel: settings.serviceChargeLabel,
    // Cast nested objects as they might need deeper validation in a stricter setup
    // but for now we assume the shape matches via the interface
    // Check if operatingHours has keys, otherwise fallback to defaults
    operatingHours:
      settings.operatingHours && Object.keys(settings.operatingHours).length > 0
        ? (settings.operatingHours as SettingsData['operatingHours'])
        : undefined,
    notificationSettings: {
      orderAlerts: settings.notificationSettings?.orderAlerts ?? true,
      soundEnabled: settings.notificationSettings?.soundEnabled ?? true,
      soundType: (settings.notificationSettings?.soundType ??
        'chime') as SettingsData['notificationSettings']['soundType'],
      desktopNotifications:
        settings.notificationSettings?.desktopNotifications ?? true,
    },
    receiptSettings: {
      headerText: settings.receiptSettings?.headerText ?? '',
      footerText: settings.receiptSettings?.footerText ?? '',
      paperSize: (settings.receiptSettings?.paperSize ??
        '80mm') as SettingsData['receiptSettings']['paperSize'],
    },
    paymentMethods: settings.paymentMethods || {
      cash: true,
      card: true,
      ewallet: true,
    },
    systemPreferences: {
      dateFormat: (settings.systemPreferences?.dateFormat ??
        'DD/MM/YYYY') as SettingsData['systemPreferences']['dateFormat'],
      timeFormat: (settings.systemPreferences?.timeFormat ??
        '24h') as SettingsData['systemPreferences']['timeFormat'],
      language: (settings.systemPreferences?.language ??
        'en') as SettingsData['systemPreferences']['language'],
    },
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <GeneralSection
            initialData={{
              name: uiSettings.name,
              address: uiSettings.address,
              phone: uiSettings.phone,
              email: uiSettings.email,
              description: uiSettings.description,
            }}
            onUpdate={() => {}}
          />
        );
      case 'hours':
        return (
          <OperatingHoursSection
            initialData={{
              operatingHours: uiSettings.operatingHours || {
                monday: {
                  isOpen: true,
                  slots: [{ open: '09:00', close: '17:00' }],
                },
                tuesday: {
                  isOpen: true,
                  slots: [{ open: '09:00', close: '17:00' }],
                },
                wednesday: {
                  isOpen: true,
                  slots: [{ open: '09:00', close: '17:00' }],
                },
                thursday: {
                  isOpen: true,
                  slots: [{ open: '09:00', close: '17:00' }],
                },
                friday: {
                  isOpen: true,
                  slots: [{ open: '09:00', close: '17:00' }],
                },
                saturday: {
                  isOpen: true,
                  slots: [{ open: '09:00', close: '17:00' }],
                },
                sunday: { isOpen: false, slots: [] },
              },
            }}
            onUpdate={() => {}}
          />
        );
      case 'financial':
        return (
          <FinancialSection
            initialData={{
              currency: uiSettings.currency,
              taxRate: uiSettings.taxRate,
              serviceChargeRate: uiSettings.serviceChargeRate,
              taxLabel: uiSettings.taxLabel,
              serviceChargeLabel: uiSettings.serviceChargeLabel,
            }}
            onUpdate={() => {}}
          />
        );
      case 'notifications':
        return (
          <NotificationsSection
            initialData={{
              notificationSettings: uiSettings.notificationSettings,
            }}
            onUpdate={() => {}}
          />
        );
      case 'payments':
        return (
          <PaymentMethodsSection
            initialData={{
              paymentMethods: uiSettings.paymentMethods,
            }}
            onUpdate={() => {}}
          />
        );
      case 'receipt':
        return (
          <ReceiptSection
            initialData={{
              receiptSettings: uiSettings.receiptSettings,
            }}
            onUpdate={() => {}}
          />
        );
      case 'system':
        return (
          <SystemPreferencesSection
            initialData={{
              systemPreferences: uiSettings.systemPreferences,
            }}
            onUpdate={() => {}}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      {/* Mobile Dropdown */}
      <div className="md:hidden px-5 pt-6 pb-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as SectionKey)}
            className="w-full px-4 py-3 bg-white border-0 rounded-xl font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1.5rem',
              paddingRight: '2.5rem',
            }}
          >
            {SECTIONS.map((section) => (
              <option key={section.key} value={section.key}>
                {section.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 p-5 overflow-y-auto">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Settings</h2>
          <nav className="space-y-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeSection === section.key
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-3xl">{renderSection()}</div>
        </div>
      </div>

      {/* Mobile Content */}
      <div className="md:hidden px-5 pt-4">{renderSection()}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PermissionGuard permission="settings:read">
      <SettingsContent />
    </PermissionGuard>
  );
}
