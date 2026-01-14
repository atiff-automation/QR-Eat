/**
 * Performance Tracker for TanStack Query Migration
 *
 * Tracks API calls, cache hits/misses, and response times
 * to measure the impact of TanStack Query migration.
 *
 * @see tanstack_implementation_plan.md
 */

interface PerformanceMetrics {
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  totalResponseTime: number;
  apiCallCount: number;
  endpoints: Map<string, number>;
}

class PerformanceTrackerClass {
  private metrics: PerformanceMetrics = {
    apiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalResponseTime: 0,
    apiCallCount: 0,
    endpoints: new Map(),
  };

  private startTime: number = Date.now();

  /**
   * Track an API call
   */
  trackAPICall(endpoint: string, duration: number): void {
    this.metrics.apiCalls++;
    this.metrics.apiCallCount++;
    this.metrics.totalResponseTime += duration;

    // Track endpoint frequency
    const count = this.metrics.endpoints.get(endpoint) || 0;
    this.metrics.endpoints.set(endpoint, count + 1);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[PERF] API Call: ${endpoint} - ${duration}ms`);
    }
  }

  /**
   * Track a cache hit
   */
  trackCacheHit(key: string): void {
    this.metrics.cacheHits++;

    if (process.env.NODE_ENV === 'development') {
      console.log(`[PERF] Cache Hit: ${key}`);
    }
  }

  /**
   * Track a cache miss
   */
  trackCacheMiss(key: string): void {
    this.metrics.cacheMisses++;

    if (process.env.NODE_ENV === 'development') {
      console.log(`[PERF] Cache Miss: ${key}`);
    }
  }

  /**
   * Get performance report
   */
  getReport() {
    const totalCacheRequests =
      this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate =
      totalCacheRequests > 0
        ? (this.metrics.cacheHits / totalCacheRequests) * 100
        : 0;

    const avgResponseTime =
      this.metrics.apiCallCount > 0
        ? this.metrics.totalResponseTime / this.metrics.apiCallCount
        : 0;

    const elapsedMinutes = (Date.now() - this.startTime) / 1000 / 60;
    const apiCallsPerHour =
      elapsedMinutes > 0 ? (this.metrics.apiCalls / elapsedMinutes) * 60 : 0;

    // Get top 10 most called endpoints
    const topEndpoints = Array.from(this.metrics.endpoints.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return {
      timestamp: new Date().toISOString(),
      elapsedMinutes: Math.round(elapsedMinutes * 100) / 100,
      apiCalls: this.metrics.apiCalls,
      apiCallsPerHour: Math.round(apiCallsPerHour),
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      topEndpoints,
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      apiCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalResponseTime: 0,
      apiCallCount: 0,
      endpoints: new Map(),
    };
    this.startTime = Date.now();
  }

  /**
   * Export metrics to JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.getReport(), null, 2);
  }
}

// Singleton instance
export const PerformanceTracker = new PerformanceTrackerClass();
