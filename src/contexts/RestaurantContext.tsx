'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { ApiClient } from '@/lib/api-client';
import { debug } from '@/lib/debug';

interface RestaurantSettings {
  currency: string;
  taxRate: number;
  serviceCharge: number;
  restaurantName: string;
  paymentMethods: {
    cash: boolean;
    card: boolean;
    ewallet: boolean;
  };
  // Add other settings as needed
}

interface RestaurantContextType {
  settings: RestaurantSettings;
  isLoading: boolean;
  error: string | null;
  refetchSettings: () => Promise<void>;
}

const defaultSettings: RestaurantSettings = {
  currency: 'MYR',
  taxRate: 0.1,
  serviceCharge: 0.05,
  restaurantName: 'Restaurant',
  paymentMethods: {
    cash: true,
    card: true,
    ewallet: true,
  },
};

const RestaurantContext = createContext<RestaurantContextType>({
  settings: defaultSettings,
  isLoading: true,
  error: null,
  refetchSettings: async () => {},
});

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RestaurantSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await ApiClient.get<{ settings: RestaurantSettings }>(
        '/settings/restaurant'
      );

      setSettings({
        currency: data.settings.currency || defaultSettings.currency,
        taxRate: data.settings.taxRate || defaultSettings.taxRate,
        serviceCharge:
          data.settings.serviceCharge || defaultSettings.serviceCharge,
        restaurantName:
          data.settings.restaurantName || defaultSettings.restaurantName,
        paymentMethods:
          data.settings.paymentMethods || defaultSettings.paymentMethods,
      });

      debug.info('RestaurantContext', 'Settings loaded:', data.settings);
    } catch (err) {
      debug.error('RestaurantContext', 'Failed to fetch settings:', err);
      setError('Failed to load restaurant settings');
      // Keep using default settings on error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const value: RestaurantContextType = {
    settings,
    isLoading,
    error,
    refetchSettings: fetchSettings,
  };

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
}

// Custom hook for easy access
export function useRestaurantSettings() {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error(
      'useRestaurantSettings must be used within RestaurantProvider'
    );
  }
  return context;
}

// Convenience hook to just get currency
export function useCurrency() {
  const { settings } = useRestaurantSettings();
  return settings.currency;
}

// Convenience hook to get payment methods
export function usePaymentMethods() {
  const { settings } = useRestaurantSettings();
  return settings.paymentMethods;
}
