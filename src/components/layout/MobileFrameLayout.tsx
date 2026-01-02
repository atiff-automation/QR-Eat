/**
 * Mobile Frame Layout Component
 *
 * Applies mobile-only view styling at the page level.
 * The actual frame effect is handled by CSS on the body element.
 */

interface MobileFrameLayoutProps {
  children: React.ReactNode;
}

export function MobileFrameLayout({ children }: MobileFrameLayoutProps) {
  return (
    <div id="mobile-frame-container" className="min-h-screen w-full">
      <div id="mobile-frame-content" className="min-h-screen bg-white">
        {children}
      </div>
    </div>
  );
}
