/**
 * Cache Monitor
 * Tracks cache hit rates and performance metrics
 */

interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  hitRate: string;
  total: number;
}

class CacheMonitor {
  private hits = 0;
  private misses = 0;
  private invalidations = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordInvalidation(): void {
    this.invalidations++;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
      hitRate: hitRate.toFixed(2) + '%',
      total,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
  }
}

export const cacheMonitor = new CacheMonitor();

// Log stats every 5 minutes in production
if (process.env.NODE_ENV === 'production') {
  setInterval(
    () => {
      const stats = cacheMonitor.getStats();
      console.log('[Cache Stats]', stats);

      // Reset after logging
      cacheMonitor.reset();
    },
    5 * 60 * 1000
  );
}
