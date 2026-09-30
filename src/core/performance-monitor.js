// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE MONITOR
// Track and optimize application performance metrics
// ═══════════════════════════════════════════════════════════════════════════════

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      navigation: {},
      resources: [],
      marks: {},
      measures: {},
      vitals: {},
    };

    this.observers = [];
    this.init();
  }

  /**
   * Initialize performance monitoring
   */
  init() {
    if (typeof window === 'undefined') {
      return;
    }

    // Monitor navigation timing
    this.captureNavigationTiming();

    // Monitor resource timing
    this.captureResourceTiming();

    // Setup performance observers
    this.setupObservers();

    // Monitor Core Web Vitals
    this.monitorWebVitals();

    // Monitor long tasks
    this.monitorLongTasks();

    // Monitor memory usage
    this.monitorMemory();
  }

  /**
   * Capture navigation timing
   */
  captureNavigationTiming() {
    if (!window.performance || !window.performance.timing) {
      return;
    }

    const timing = window.performance.timing;
    const navigation = window.performance.navigation;

    this.metrics.navigation = {
      // DNS lookup
      dnsTime: timing.domainLookupEnd - timing.domainLookupStart,

      // TCP connection
      tcpTime: timing.connectEnd - timing.connectStart,

      // Request/Response
      requestTime: timing.responseStart - timing.requestStart,
      responseTime: timing.responseEnd - timing.responseStart,

      // DOM processing
      domProcessing: timing.domComplete - timing.domLoading,
      domInteractive: timing.domInteractive - timing.navigationStart,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,

      // Page load
      loadComplete: timing.loadEventEnd - timing.navigationStart,

      // Total time
      totalTime: timing.loadEventEnd - timing.navigationStart,

      // Navigation type
      navigationType: this.getNavigationType(navigation.type),

      // Redirect count
      redirectCount: navigation.redirectCount,
    };
  }

  /**
   * Get navigation type string
   */
  getNavigationType(type) {
    const types = ['navigate', 'reload', 'back_forward', 'prerender'];
    return types[type] || 'unknown';
  }

  /**
   * Capture resource timing
   */
  captureResourceTiming() {
    if (!window.performance || !window.performance.getEntriesByType) {
      return;
    }

    const resources = window.performance.getEntriesByType('resource');

    this.metrics.resources = resources.map(resource => ({
      name: resource.name,
      type: resource.initiatorType,
      duration: resource.duration,
      size: resource.transferSize || 0,
      startTime: resource.startTime,
      cached: resource.transferSize === 0 && resource.decodedBodySize > 0,
    }));
  }

  /**
   * Setup performance observers
   */
  setupObservers() {
    if (!window.PerformanceObserver) {
      return;
    }

    // Observe paint timing
    try {
      const paintObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          this.metrics.vitals[entry.name] = entry.startTime;
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });
      this.observers.push(paintObserver);
    } catch {
      console.warn('[Performance] Paint observer not supported');
    }

    // Observe largest contentful paint
    try {
      const lcpObserver = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.vitals.lcp = lastEntry.renderTime || lastEntry.loadTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);
    } catch {
      console.warn('[Performance] LCP observer not supported');
    }

    // Observe layout shifts
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            this.metrics.vitals.cls = clsValue;
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    } catch {
      console.warn('[Performance] CLS observer not supported');
    }
  }

  /**
   * Monitor Core Web Vitals
   */
  monitorWebVitals() {
    // First Input Delay (FID)
    if ('PerformanceEventTiming' in window) {
      const fidObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-input') {
            this.metrics.vitals.fid = entry.processingStart - entry.startTime;
          }
        }
      });

      try {
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch {
        console.warn('[Performance] FID observer not supported');
      }
    }

    // Time to First Byte (TTFB)
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      this.metrics.vitals.ttfb = timing.responseStart - timing.requestStart;
    }
  }

  /**
   * Monitor long tasks
   */
  monitorLongTasks() {
    if (!window.PerformanceObserver) {
      return;
    }

    try {
      const longTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          console.warn('[Performance] Long task detected:', {
            duration: entry.duration,
            startTime: entry.startTime,
          });

          if (!this.metrics.longTasks) {
            this.metrics.longTasks = [];
          }

          this.metrics.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      });

      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);
    } catch {
      console.warn('[Performance] Long task observer not supported');
    }
  }

  /**
   * Monitor memory usage
   */
  monitorMemory() {
    if (!window.performance || !window.performance.memory) {
      return;
    }

    setInterval(() => {
      const memory = window.performance.memory;
      this.metrics.memory = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        percentage: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2),
      };
    }, 10000); // Check every 10 seconds
  }

  /**
   * Create custom performance mark
   */
  mark(name) {
    if (!window.performance || !window.performance.mark) {
      return;
    }

    window.performance.mark(name);
    this.metrics.marks[name] = window.performance.now();
  }

  /**
   * Measure time between two marks
   */
  measure(name, startMark, endMark) {
    if (!window.performance || !window.performance.measure) {
      return;
    }

    try {
      window.performance.measure(name, startMark, endMark);
      const measure = window.performance.getEntriesByName(name, 'measure')[0];
      this.metrics.measures[name] = measure.duration;
      return measure.duration;
    } catch (e) {
      console.error('[Performance] Measure failed:', e);
      return null;
    }
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      connection: this.getConnectionInfo(),
    };
  }

  /**
   * Get connection information
   */
  getConnectionInfo() {
    if (!navigator.connection && !navigator.mozConnection && !navigator.webkitConnection) {
      return null;
    }

    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }

  /**
   * Get performance score
   */
  getPerformanceScore() {
    const vitals = this.metrics.vitals;
    let score = 100;

    // LCP scoring (< 2.5s = good, < 4s = needs improvement, > 4s = poor)
    if (vitals.lcp) {
      if (vitals.lcp > 4000) {
        score -= 30;
      } else if (vitals.lcp > 2500) {
        score -= 15;
      }
    }

    // FID scoring (< 100ms = good, < 300ms = needs improvement, > 300ms = poor)
    if (vitals.fid) {
      if (vitals.fid > 300) {
        score -= 25;
      } else if (vitals.fid > 100) {
        score -= 10;
      }
    }

    // CLS scoring (< 0.1 = good, < 0.25 = needs improvement, > 0.25 = poor)
    if (vitals.cls) {
      if (vitals.cls > 0.25) {
        score -= 25;
      } else if (vitals.cls > 0.1) {
        score -= 10;
      }
    }

    // TTFB scoring (< 800ms = good, < 1800ms = needs improvement, > 1800ms = poor)
    if (vitals.ttfb) {
      if (vitals.ttfb > 1800) {
        score -= 20;
      } else if (vitals.ttfb > 800) {
        score -= 10;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Log performance report
   */
  logReport() {
    const metrics = this.getMetrics();
    const score = this.getPerformanceScore();

    /* eslint-disable no-console -- this method's entire purpose is to print the report */
    console.group('📊 Performance Report');
    console.log('Score:', score + '/100');
    console.log('Navigation:', metrics.navigation);
    console.log('Web Vitals:', metrics.vitals);
    console.log('Resources:', metrics.resources.length, 'loaded');
    console.log('Memory:', metrics.memory);
    console.log('Connection:', metrics.connection);
    console.groupEnd();
    /* eslint-enable no-console */

    return { metrics, score };
  }

  /**
   * Send metrics to analytics
   */
  sendToAnalytics(endpoint) {
    const data = {
      metrics: this.getMetrics(),
      score: this.getPerformanceScore(),
      url: window.location.href,
      timestamp: Date.now(),
    };

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, JSON.stringify(data));
    } else {
      fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(console.error);
    }
  }

  /**
   * Cleanup observers
   */
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-log report on page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      performanceMonitor.logReport();
    }, 3000); // Wait 3 seconds after load
  });
}

// Export for manual usage
export default PerformanceMonitor;
