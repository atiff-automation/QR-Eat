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
    marginRight: string;
  }>({
    overflow: '',
    paddingRight: '',
    marginRight: '',
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
        marginRight: body.style.marginRight,
      };

      // Check if we are in mobile frame mode (desktop view of QR page)
      // We check for the content ID which is present on QR pages
      const isMobileFrame = !!document.getElementById('mobile-frame-content');

      // Get scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - html.clientWidth;

      if (isMobileFrame) {
        // For mobile frame on desktop, we simply hide overflow.
        // We DON'T render it fixed/left/right=0 because that breaks the 414px centering.
        body.style.overflow = 'hidden';

        // Use MARGIN-RIGHT to compensate for scrollbar instead of padding.
        // This keeps the content width fixed at 414px but shifts the box left
        // to match the original centered position relative to the window.
        if (scrollbarWidth > 0) {
          body.style.marginRight = `${scrollbarWidth}px`;
        }
      } else {
        // Standard mobile behavior - aggressive locking
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
      }
    } else {
      // Remove scroll lock styles
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = originalStylesRef.current.overflow;
      body.style.paddingRight = originalStylesRef.current.paddingRight;
      body.style.marginRight = originalStylesRef.current.marginRight;

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
        body.style.marginRight = originalStylesRef.current.marginRight;
      }
    };
  }, [isLocked]);
}
