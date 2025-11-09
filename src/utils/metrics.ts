import { logger } from './logger';

/**
 * Metrics collector for monitoring server performance
 */
export class MetricsCollector {
  private static instance: MetricsCollector;
  
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  private constructor() {
    // Start periodic metrics logging
    this.startPeriodicLogging();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * Record a histogram value (for response times, etc.)
   */
  recordHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) || [];
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(name, values);
  }

  /**
   * Record response time
   */
  recordResponseTime(event: string, duration: number): void {
    this.recordHistogram(`response_time.${event}`, duration);
    this.incrementCounter(`requests.${event}`);
  }

  /**
   * Record error
   */
  recordError(event: string, errorType: string): void {
    this.incrementCounter(`errors.${event}.${errorType}`);
    this.incrementCounter('errors.total');
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string): HistogramStats | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { count: sorted.length, avg, min, max, p50, p95, p99 };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): MetricsSummary {
    const counters: Record<string, number> = {};
    this.counters.forEach((value, key) => {
      counters[key] = value;
    });

    const gauges: Record<string, number> = {};
    this.gauges.forEach((value, key) => {
      gauges[key] = value;
    });

    const histograms: Record<string, HistogramStats | null> = {};
    this.histograms.forEach((_, key) => {
      histograms[key] = this.getHistogramStats(key);
    });

    return { counters, gauges, histograms };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Start periodic metrics logging
   */
  private startPeriodicLogging(): void {
    const INTERVAL = 5 * 60 * 1000; // 5 minutes

    setInterval(() => {
      const metrics = this.getAllMetrics();
      logger.info('Metrics summary', metrics);
    }, INTERVAL);
  }
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private event: string;

  constructor(event: string) {
    this.event = event;
    this.startTime = Date.now();
  }

  /**
   * End timer and record metric
   */
  end(): number {
    const duration = Date.now() - this.startTime;
    metricsCollector.recordResponseTime(this.event, duration);
    return duration;
  }

  /**
   * End timer and log if slow
   */
  endAndLogIfSlow(threshold: number = 1000): number {
    const duration = this.end();
    if (duration > threshold) {
      logger.warn('Slow operation detected', {
        event: this.event,
        duration,
        threshold,
      });
    }
    return duration;
  }
}

/**
 * Types
 */
interface HistogramStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

interface MetricsSummary {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramStats | null>;
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();

/**
 * Helper function to track operation performance
 */
export async function trackPerformance<T>(
  event: string,
  operation: () => Promise<T>
): Promise<T> {
  const timer = new PerformanceTimer(event);
  try {
    const result = await operation();
    timer.end();
    return result;
  } catch (error) {
    timer.end();
    throw error;
  }
}
