import { DataFrame } from '@grafana/data';
import { QueryType } from 'types/queryBuilder';
import {
  CacheKey,
  CacheEntry,
  CacheConfig,
  CacheStats,
  QuerySplitResult,
  DEFAULT_CACHE_CONFIG,
} from './types';
import { hashString, normalizeSqlForCache } from './sqlNormalizer';
import { filterDataFrameByTimeRange, estimateDataFrameSize, mergeDataFrames } from './dataFrameUtils';

/**
 * QueryCache manages caching of query results to avoid re-fetching
 * historical data that hasn't changed.
 *
 * Features:
 * - LRU eviction when size limit exceeded
 * - TTL-based expiration
 * - Query splitting for partial cache hits
 * - Time-based data filtering and merging
 */
export class QueryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    partialHits: 0,
    evictions: 0,
    totalSizeBytes: 0,
    entryCount: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      ...DEFAULT_CACHE_CONFIG,
      ...config,
    };
  }

  /**
   * Get the current cache configuration.
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration.
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // If cache was disabled, clear it
    if (!this.config.enabled) {
      this.clear();
    }
  }

  /**
   * Generate a unique cache key from query parameters.
   *
   * @param database - Database name
   * @param table - Table name
   * @param queryType - Type of query
   * @param rawSql - The raw SQL query (will be normalized)
   * @param intervalMs - The interval in milliseconds (different zoom levels need separate caches)
   */
  generateKey(database: string, table: string, queryType: QueryType, rawSql: string, intervalMs?: number): CacheKey {
    const normalizedSql = normalizeSqlForCache(rawSql);
    const queryHash = hashString(normalizedSql);

    return {
      queryHash,
      database,
      table,
      queryType,
      intervalMs,
    };
  }

  /**
   * Look up a query in the cache and determine what portions need fetching.
   *
   * @param key - Cache key for the query
   * @param requestedStart - Start time in ms
   * @param requestedEnd - End time in ms
   * @returns QuerySplitResult indicating cached vs fetch portions
   */
  lookup(key: CacheKey, requestedStart: number, requestedEnd: number): QuerySplitResult {
    const keyString = this.keyToString(key);
    const entry = this.cache.get(keyString);
    const now = Date.now();
    const cacheableEnd = now - this.config.stalenessThresholdMs;

    // If entire requested range is historical (before staleness threshold), no fresh fetch needed
    const isFullyHistorical = requestedEnd <= cacheableEnd;

    this.log(`Cache lookup: ${keyString}, range: [${requestedStart}, ${requestedEnd}], fullyHistorical: ${isFullyHistorical}`);

    // If no cache entry or cache is disabled
    if (!entry || !this.config.enabled) {
      this.stats.misses++;
      this.log('Cache miss: no entry or cache disabled');
      return {
        cachedPortion: null,
        fetchPortions: [{ startTime: requestedStart, endTime: requestedEnd }],
        fullRange: { startTime: requestedStart, endTime: requestedEnd },
      };
    }

    // Check if entry is expired
    if (now - entry.createdAt > this.config.maxAgeTTLMs) {
      this.cache.delete(keyString);
      this.updateSizeStats();
      this.stats.misses++;
      this.stats.evictions++;
      this.log('Cache miss: entry expired');
      return {
        cachedPortion: null,
        fetchPortions: [{ startTime: requestedStart, endTime: requestedEnd }],
        fullRange: { startTime: requestedStart, endTime: requestedEnd },
      };
    }

    // Update last accessed time
    entry.lastAccessedAt = now;

    // Calculate what portions we need to fetch
    const fetchPortions: Array<{ startTime: number; endTime: number }> = [];

    // If requested range starts before cached range, fetch that portion
    if (requestedStart < entry.startTime) {
      fetchPortions.push({
        startTime: requestedStart,
        endTime: Math.min(entry.startTime, requestedEnd),
      });
      this.log(`Need to fetch before cache: [${requestedStart}, ${Math.min(entry.startTime, requestedEnd)}]`);
    }

    // If cached data ends before the staleness threshold, fetch the gap
    // This handles: [cached]---gap---[staleness threshold]---[fresh data]---[requestedEnd]
    if (entry.endTime < cacheableEnd && entry.endTime < requestedEnd) {
      const gapStart = Math.max(entry.endTime, requestedStart);
      const gapEnd = Math.min(cacheableEnd, requestedEnd);
      if (gapEnd > gapStart) {
        fetchPortions.push({
          startTime: gapStart,
          endTime: gapEnd,
        });
        this.log(`Need to fetch gap: [${gapStart}, ${gapEnd}]`);
      }
    }

    // Only fetch fresh data if the requested range extends into the "fresh" window
    // If the entire range is historical, skip fresh fetch
    if (!isFullyHistorical && cacheableEnd < requestedEnd) {
      const freshStart = Math.max(cacheableEnd, requestedStart);
      fetchPortions.push({
        startTime: freshStart,
        endTime: requestedEnd,
      });
      this.log(`Need to fetch fresh data: [${freshStart}, ${requestedEnd}]`);
    }

    // Determine usable cached portion
    // For fully historical queries, we can use the entire cached range
    const cacheStart = Math.max(entry.startTime, requestedStart);
    const cacheEnd = isFullyHistorical
      ? Math.min(entry.endTime, requestedEnd)
      : Math.min(entry.endTime, cacheableEnd, requestedEnd);

    if (cacheEnd > cacheStart) {
      // We have usable cached data
      const cachedData = filterDataFrameByTimeRange(entry.data, cacheStart, cacheEnd);

      if (fetchPortions.length === 0) {
        this.stats.hits++;
        this.log('Cache hit: full coverage from cache');
      } else {
        this.stats.partialHits++;
        this.log(`Partial cache hit: cached [${cacheStart}, ${cacheEnd}]`);
      }

      return {
        cachedPortion: {
          data: cachedData,
          startTime: cacheStart,
          endTime: cacheEnd,
        },
        fetchPortions,
        fullRange: { startTime: requestedStart, endTime: requestedEnd },
      };
    }

    // No usable cached data
    this.stats.misses++;
    this.log('Cache miss: no overlap with cached data');
    return {
      cachedPortion: null,
      fetchPortions: [{ startTime: requestedStart, endTime: requestedEnd }],
      fullRange: { startTime: requestedStart, endTime: requestedEnd },
    };
  }

  /**
   * Store data in the cache, extending an existing entry if present.
   *
   * @param key - Cache key
   * @param data - DataFrames to cache
   * @param startTime - Start time of the data
   * @param endTime - End time of the data
   * @param originalSql - Original SQL for debugging
   */
  store(
    key: CacheKey,
    data: DataFrame[],
    startTime: number,
    endTime: number,
    originalSql: string
  ): void {
    if (!this.config.enabled || data.length === 0) {
      return;
    }

    const keyString = this.keyToString(key);
    const existingEntry = this.cache.get(keyString);
    const now = Date.now();
    const sizeBytes = estimateDataFrameSize(data);

    this.log(`Storing cache entry: ${keyString}, size: ${sizeBytes} bytes, range: [${startTime}, ${endTime}]`);

    // Evict entries if necessary to make room
    this.evictIfNecessary(sizeBytes);

    if (existingEntry && now - existingEntry.createdAt < this.config.maxAgeTTLMs) {
      // Extend existing entry
      this.log('Extending existing cache entry');

      const newStartTime = Math.min(existingEntry.startTime, startTime);
      const newEndTime = Math.max(existingEntry.endTime, endTime);

      // Merge and deduplicate data to prevent unbounded cache growth
      const mergedData = mergeDataFrames(
        { data: existingEntry.data, startTime: existingEntry.startTime, endTime: existingEntry.endTime },
        { data, startTime, endTime }
      );

      existingEntry.data = mergedData;
      existingEntry.startTime = newStartTime;
      existingEntry.endTime = newEndTime;
      existingEntry.lastAccessedAt = now;
      existingEntry.sizeBytes = estimateDataFrameSize(mergedData);
    } else {
      // Create new entry
      this.log('Creating new cache entry');
      const entry: CacheEntry = {
        key,
        data,
        startTime,
        endTime,
        createdAt: now,
        lastAccessedAt: now,
        sizeBytes,
        originalSql,
      };
      this.cache.set(keyString, entry);
    }

    this.updateSizeStats();
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.updateSizeStats();
    this.log('Cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics counters.
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.partialHits = 0;
    this.stats.evictions = 0;
  }

  /**
   * Convert cache key to string for Map storage.
   */
  private keyToString(key: CacheKey): string {
    // Include intervalMs in key so different zoom levels get separate cache entries
    const interval = key.intervalMs ?? 'default';
    return `${key.database}:${key.table}:${key.queryType}:${key.queryHash}:${interval}`;
  }

  /**
   * Evict entries using LRU if cache size would exceed limit.
   */
  private evictIfNecessary(incomingSize: number): void {
    while (
      this.stats.totalSizeBytes + incomingSize > this.config.maxSizeBytes &&
      this.cache.size > 0
    ) {
      // Find LRU entry
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.log(`Evicting LRU entry: ${oldestKey}`);
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }

      this.updateSizeStats();
    }
  }

  /**
   * Update the size statistics based on current cache contents.
   */
  private updateSizeStats(): void {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.sizeBytes;
    }
    this.stats.totalSizeBytes = totalSize;
    this.stats.entryCount = this.cache.size;
  }

  /**
   * Log a message if debug mode is enabled.
   * Uses console.warn because production builds strip console.log
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.warn(`[QueryCache] ${message}`);
    }
  }
}
