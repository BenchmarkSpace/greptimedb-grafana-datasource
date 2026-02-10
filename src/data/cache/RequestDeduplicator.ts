import { DataFrame } from '@grafana/data';
import { Observable, Subject, of, from } from 'rxjs';
import { share, finalize, tap } from 'rxjs/operators';

interface InFlightRequest {
  observable: Observable<DataFrame[]>;
  timestamp: number;
}

/**
 * RequestDeduplicator prevents duplicate concurrent requests.
 * If multiple callers request the same query before the first one completes,
 * they all share the same request/response.
 *
 * This is critical for dashboards with many panels that may issue
 * identical or near-identical queries simultaneously.
 */
export class RequestDeduplicator {
  private inFlight: Map<string, InFlightRequest> = new Map();
  private recentResults: Map<string, { data: DataFrame[]; timestamp: number }> = new Map();
  private debug: boolean;
  private resultCacheDurationMs: number;

  constructor(options: { debug?: boolean; resultCacheDurationMs?: number } = {}) {
    this.debug = options.debug ?? false;
    // Cache results for a short time (default 100ms) to handle rapid duplicate requests
    this.resultCacheDurationMs = options.resultCacheDurationMs ?? 100;
  }

  /**
   * Execute a query with deduplication.
   * If the same query is already in flight, returns the existing observable.
   * If a recent result exists, returns it immediately.
   */
  execute(
    key: string,
    executeFn: () => Observable<DataFrame[]>
  ): Observable<DataFrame[]> {
    const now = Date.now();

    // Check for very recent cached result (within resultCacheDurationMs)
    const cached = this.recentResults.get(key);
    if (cached && now - cached.timestamp < this.resultCacheDurationMs) {
      this.log(`Returning cached result for ${key} (age: ${now - cached.timestamp}ms)`);
      return of(cached.data);
    }

    // Check for in-flight request
    const inFlight = this.inFlight.get(key);
    if (inFlight) {
      this.log(`Sharing in-flight request for ${key}`);
      return inFlight.observable;
    }

    // Execute new request
    this.log(`Executing new request for ${key}`);
    const startTime = performance.now();

    const observable = executeFn().pipe(
      tap((data) => {
        // Cache the result briefly
        this.recentResults.set(key, { data, timestamp: Date.now() });
        this.log(`Request completed for ${key} in ${(performance.now() - startTime).toFixed(0)}ms`);
      }),
      finalize(() => {
        // Remove from in-flight when done
        this.inFlight.delete(key);
      }),
      // Share the observable so multiple subscribers get the same result
      share()
    );

    this.inFlight.set(key, { observable, timestamp: now });

    // Clean up old cached results periodically
    this.cleanupOldResults();

    return observable;
  }

  /**
   * Generate a cache key from SQL
   */
  generateKey(sql: string): string {
    // Simple hash for the key
    let hash = 0;
    for (let i = 0; i < sql.length; i++) {
      const char = sql.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sql:${hash}`;
  }

  /**
   * Clean up old cached results
   */
  private cleanupOldResults(): void {
    const now = Date.now();
    const maxAge = this.resultCacheDurationMs * 10; // Keep for 10x the cache duration

    for (const [key, entry] of this.recentResults) {
      if (now - entry.timestamp > maxAge) {
        this.recentResults.delete(key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.recentResults.clear();
    // Note: can't clear in-flight requests as they have subscribers
  }

  /**
   * Update debug setting
   */
  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  /**
   * Get stats for monitoring
   */
  getStats(): { inFlightCount: number; cachedCount: number } {
    return {
      inFlightCount: this.inFlight.size,
      cachedCount: this.recentResults.size,
    };
  }

  private log(message: string): void {
    if (this.debug) {
      console.warn(`[RequestDeduplicator] ${message}`);
    }
  }
}
