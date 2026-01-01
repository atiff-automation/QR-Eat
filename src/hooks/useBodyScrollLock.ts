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
  const originalStylesRef = useRef<{
    overflow: string;
    paddingRight: string;
  }>({
    overflow: '',
    paddingRight: '',
  });

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;

    if (isLocked) {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Save original styles
      originalStylesRef.current = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };

      // Get scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - html.clientWidth;

      // Apply scroll lock styles using position fixed
      // This prevents the page from jumping to top
      body.style.position = 'fixed';
      body.style.top = `-${scrollPositionRef.current}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.overflow = 'hidden';

      // Compensate for scrollbar width to prevent layout shift
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      // Remove scroll lock styles
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = originalStylesRef.current.overflow;
      body.style.paddingRight = originalStylesRef.current.paddingRight;

      // Restore scroll position instantly (no smooth scroll)
      window.scrollTo({
        top: scrollPositionRef.current,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      });
    }

    // Cleanup function
    return () => {
      // Only cleanup if we're unmounting while locked
      if (isLocked) {
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.overflow = originalStylesRef.current.overflow;
        body.style.paddingRight = originalStylesRef.current.paddingRight;
      }
    };
  }, [isLocked]);
}
