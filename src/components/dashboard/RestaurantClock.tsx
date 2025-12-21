/**
 * Restaurant Clock Component
 *
 * Isolated clock component that updates every second without causing
 * parent component re-renders. Uses React.memo for optimization.
 */

'use client';

import { useState, useEffect, memo } from 'react';

interface RestaurantClockProps {
  timezone: string;
  className?: string;
}

function RestaurantClockComponent({
  timezone,
  className = '',
}: RestaurantClockProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  return (
    <div className={className}>
      {currentTime.toLocaleString('en-US', {
        timeZone: timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </div>
  );
}

// Memoize to prevent re-renders when parent re-renders
export const RestaurantClock = memo(RestaurantClockComponent);
