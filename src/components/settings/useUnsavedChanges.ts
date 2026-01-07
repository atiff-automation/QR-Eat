/**
 * useUnsavedChanges Hook
 * Warns users before leaving the page with unsaved changes
 */

import { useEffect, useState } from 'react';

export function useUnsavedChanges(hasUnsavedChanges: boolean) {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const confirmNavigation = (callback: () => void) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );
      if (confirmed) {
        callback();
      }
    } else {
      callback();
    }
  };

  return { confirmNavigation, showWarning, setShowWarning };
}
