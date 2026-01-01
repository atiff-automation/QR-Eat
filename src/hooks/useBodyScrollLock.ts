import { useEffect, useRef } from 'react';

/**
 * Custom hook to lock/unlock body scroll
 * Prevents the main page from scrolling when modals are open,
 * which keeps the mobile browser UI (address bar, navigation) stable
 *
 * @param isLocked - Whether to lock the body scroll
 */
export function useBodyScrollLock(isLocked: boolean) {
  const scrollPositionRef = useRef<number>(0);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;

    if (isLocked) {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Get scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - html.clientWidth;

      // Apply scroll lock styles
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${scrollPositionRef.current}px`;
      body.style.width = '100%';

      // Compensate for scrollbar width to prevent layout shift
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      // Remove scroll lock styles
      const scrollY = scrollPositionRef.current;

      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.paddingRight = '';

      // Restore scroll position
      window.scrollTo(0, scrollY);
    }

    // Cleanup function
    return () => {
      // Only cleanup if we're unmounting while locked
      if (isLocked) {
        body.style.overflow = '';
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.paddingRight = '';
      }
    };
  }, [isLocked]);
}
