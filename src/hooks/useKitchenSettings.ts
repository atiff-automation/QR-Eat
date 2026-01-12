import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

interface Category {
  id: string;
  name: string;
}

interface UserPreferences {
  kdsCategories?: string[];
  [key: string]: unknown;
}

export function useKitchenSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch initial data (Categories + User Preferences)
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch Available Categories
      const categoriesData = await ApiClient.get<{ categories: Category[] }>(
        '/kitchen/categories'
      );
      setCategories(categoriesData.categories);

      // 2. Fetch User Preferences (via Staff Profile or dedicated endpoint)
      // Since we don't have a direct "get preferences" endpoint, we can use the
      // session/me endpoint if it exists, OR just rely on client-side defaults for now
      // IF the backend doesn't return preferences on login.
      // However, we implemented PATCH /api/staff/preferences.
      // Usually, preferences are loaded with the user session.
      // For this implementation, let's assume we can fetch basic user info or
      // maybe we should assume the backend handles it?
      // actually, let's add a lightweight "get my preferences" or extracting it.
      // BUT, since we didn't mock a 'get preferences' endpoint in the plan (only PATCH),
      // we might need to rely on what's available.
      // Wait, the auth context usually has the user.
      // But `useKitchenSettings` needs to work reliably.

      // Let's check locally stored preferences as a fallback/initial state if API fails?
      // No, the plan says "Database Persistence".
      // So we need to get the current preferences.

      // OPTION: We didn't create a GET /api/staff/preferences.
      // We can use the return value of the PATCH to update local state,
      // but initial load needs to come from somewhere.
      // Typically `useAuth` or `useSession` provides the user object which has `preferences`.
      // Let's assume we can get it from an existing auth hook?
      // Or we can just call the PATCH endpoint with empty body to get current prefs?
      // No, that's hacky.

      // Let's check if there is a way to get current staff info.
      // `ApiClient.get('/auth/me')` or similar?
      // Looking at `useAuthAwarePolling`, it doesn't seem to fetch user details.

      // Correction: If I didn't create a GET endpoint, I should probably have.
      // BUT, I can see if I can get it from `AuthService`.
      // Actually, checking standard patterns: usually `/api/auth/me` or `/api/staff/me`.

      // Let's look at `useKitchenSettings` implementing a simple fetch for the user profile
      // if available, OR just add a simple GET handler to the `preferences` route I made?
      // I can modify the `preferences/route.ts` to also support GET. That's the cleanest way.
      // But the user said "do not touch existing code".
      // I just created `src/app/api/staff/preferences/route.ts` myself in the previous step.
      // So I CAN modify it. It's "my" code from this task.

      // REVISION: I will add GET support to `src/app/api/staff/preferences/route.ts`
      // to allow fetching current preferences.
      // AND then use it here.

      const prefsData = await ApiClient.get<{ preferences: UserPreferences }>(
        '/staff/preferences'
      );
      if (prefsData.preferences?.kdsCategories) {
        setSelectedCategories(prefsData.preferences.kdsCategories);
      }
    } catch (error) {
      console.error('Failed to fetch kitchen settings:', error);
      toast.error('Failed to load station settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save changes to API
  const savePreferences = async (newCategories: string[]) => {
    try {
      setSaving(true);
      await ApiClient.patch('/staff/preferences', {
        kdsCategories: newCategories,
      });
      // Success - no toast needed to avoid spam, maybe small indicator in UI
    } catch (error) {
      console.error('Failed to save preferences:', error);
      toast.error('Failed to save settings');
      // Revert state? For now, we keep optimistic state but warn user.
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategories((prev) => {
      const newSelection = prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId];

      // Debounce saving or save immediately?
      // For checklist, save immediately is fine if request is light.
      savePreferences(newSelection);
      return newSelection;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = categories.map((c) => c.id);
    setSelectedCategories(allIds);
    savePreferences(allIds);
  }, [categories]);

  const deselectAll = useCallback(() => {
    setSelectedCategories([]);
    savePreferences([]);
  }, []);

  return {
    categories,
    selectedCategories,
    loading,
    saving,
    toggleCategory,
    selectAll,
    deselectAll,
  };
}
