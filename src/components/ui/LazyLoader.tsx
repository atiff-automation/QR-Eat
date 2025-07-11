'use client';

import { Suspense, ComponentType } from 'react';

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}

export function LazyLoader({ children, fallback, className }: LazyLoaderProps) {
  const defaultFallback = (
    <div className={`flex items-center justify-center p-8 ${className || ''}`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <Suspense fallback={fallback || defaultFallback}>
      {children}
    </Suspense>
  );
}

interface LazyComponentProps {
  component: ComponentType<unknown>;
  props?: Record<string, unknown>;
  fallback?: React.ReactNode;
  className?: string;
}

export function LazyComponent({ component: Component, props = {}, fallback, className }: LazyComponentProps) {
  const defaultFallback = (
    <div className={`flex items-center justify-center p-8 ${className || ''}`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <Suspense fallback={fallback || defaultFallback}>
      <Component {...props} />
    </Suspense>
  );
}

// HOC for lazy loading components
export function withLazyLoading<T extends Record<string, unknown>>(
  Component: ComponentType<T>,
  fallback?: React.ReactNode
) {
  return function LazyWrappedComponent(props: T) {
    const defaultFallback = (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );

    return (
      <Suspense fallback={fallback || defaultFallback}>
        <Component {...props} />
      </Suspense>
    );
  };
}