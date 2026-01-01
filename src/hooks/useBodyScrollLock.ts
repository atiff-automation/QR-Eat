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

      // Apply scroll lock styles
      // Use overflow hidden instead of position fixed to avoid breaking fixed-position children
      body.style.overflow = 'hidden';
      body.style.height = '100vh';
      body.style.touchAction = 'none'; // Prevent touch scrolling on mobile

      // Compensate for scrollbar width to prevent layout shift
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      // Prevent scroll on html element as well
      html.style.overflow = 'hidden';
    } else {
      // Remove scroll lock styles
      body.style.overflow = originalStylesRef.current.overflow;
      body.style.height = '';
      body.style.touchAction = '';
      body.style.paddingRight = originalStylesRef.current.paddingRight;
      html.style.overflow = '';

      // Restore scroll position
      window.scrollTo(0, scrollPositionRef.current);
    }

    // Cleanup function
    return () => {
      // Only cleanup if we're unmounting while locked
      if (isLocked) {
        body.style.overflow = originalStylesRef.current.overflow;
        body.style.height = '';
        body.style.touchAction = '';
        body.style.paddingRight = originalStylesRef.current.paddingRight;
        html.style.overflow = '';
      }
    };
  }, [isLocked]);
}
