// Performance monitoring utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(label: string): () => void {
    const start = performance.now();
    
    return () => {
      const end = performance.now();
      const duration = end - start;
      
      if (!this.metrics.has(label)) {
        this.metrics.set(label, []);
      }
      
      this.metrics.get(label)!.push(duration);
      
      // Keep only the last 100 measurements
      const measurements = this.metrics.get(label)!;
      if (measurements.length > 100) {
        measurements.shift();
      }
    };
  }

  getMetrics(label: string): { avg: number; min: number; max: number; count: number } | null {
    const measurements = this.metrics.get(label);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const avg = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);
    const count = measurements.length;

    return { avg, min, max, count };
  }

  getAllMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    for (const [label, measurements] of this.metrics) {
      if (measurements.length > 0) {
        const avg = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
        const min = Math.min(...measurements);
        const max = Math.max(...measurements);
        const count = measurements.length;
        
        result[label] = { avg, min, max, count };
      }
    }
    
    return result;
  }

  clearMetrics(label?: string): void {
    if (label) {
      this.metrics.delete(label);
    } else {
      this.metrics.clear();
    }
  }
}

// Database query performance wrapper
export async function withQueryPerformance<T>(
  label: string,
  query: () => Promise<T>
): Promise<T> {
  const monitor = PerformanceMonitor.getInstance();
  const stopTimer = monitor.startTimer(`db_query_${label}`);
  
  try {
    const result = await query();
    stopTimer();
    return result;
  } catch (error) {
    stopTimer();
    throw error;
  }
}

// API route performance wrapper
export function withApiPerformance(handler: (...args: unknown[]) => Promise<unknown>) {
  return async (...args: unknown[]) => {
    const monitor = PerformanceMonitor.getInstance();
    const stopTimer = monitor.startTimer('api_request');
    
    try {
      const result = await handler(...args);
      stopTimer();
      return result;
    } catch (error) {
      stopTimer();
      throw error;
    }
  };
}

// React component performance hook
export function usePerformanceTracking(componentName: string) {
  const monitor = PerformanceMonitor.getInstance();
  
  return {
    trackRender: () => {
      const stopTimer = monitor.startTimer(`component_render_${componentName}`);
      return stopTimer;
    },
    getMetrics: () => monitor.getMetrics(`component_render_${componentName}`)
  };
}