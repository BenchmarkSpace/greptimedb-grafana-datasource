import { DataFrame } from '@grafana/data';
import { QueryType } from 'types/queryBuilder';

/**
 * Unique identifier for a cached query result
 */
export interface CacheKey {
  /** Hash of the normalized query (without time bounds) */
  queryHash: string;
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Query type for validation */
  queryType: QueryType;
  /** Interval in ms - different intervals need separate cache entries */
  intervalMs?: number;
}

/**
 * A cached query result with metadata
 */
export interface CacheEntry {
  /** Unique cache key */
  key: CacheKey;
  /** Cached DataFrame results */
  data: DataFrame[];
  /** Start time of cached data (ms since epoch, inclusive) */
  startTime: number;
  /** End time of cached data (ms since epoch, exclusive) */
  endTime: number;
  /** When this entry was created (ms since epoch) */
  createdAt: number;
  /** When this entry was last accessed (ms since epoch) */
  lastAccessedAt: number;
  /** Approximate size in bytes */
  sizeBytes: number;
  /** Original SQL for debugging */
  originalSql: string;
}

/**
 * Configuration for the query cache
 */
export interface CacheConfig {
  /** Enable/disable caching */
  enabled: boolean;
  /** Maximum cache size in bytes (default: 50MB) */
  maxSizeBytes: number;
  /** Maximum age of cache entries in ms (default: 30 min) */
  maxAgeTTLMs: number;
  /** Data older than this threshold (ms before now) is cacheable (default: 5 min) */
  stalenessThresholdMs: number;
  /** Minimum time range in ms to enable caching (default: 1 hour) */
  minTimeRangeMs: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Result of looking up a query in the cache
 */
export interface QuerySplitResult {
  /** Cached portion that can be reused, if any */
  cachedPortion: {
    data: DataFrame[];
    startTime: number;
    endTime: number;
  } | null;

  /** Portions that need to be fetched from server */
  fetchPortions: Array<{
    startTime: number;
    endTime: number;
  }>;

  /** Full requested time range */
  fullRange: {
    startTime: number;
    endTime: number;
  };
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  /** Number of full cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of partial cache hits (some data cached, some fetched) */
  partialHits: number;
  /** Number of entries evicted due to size/TTL */
  evictions: number;
  /** Current total size in bytes */
  totalSizeBytes: number;
  /** Current number of entries */
  entryCount: number;
}

/**
 * Default cache configuration values
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  maxAgeTTLMs: 30 * 60 * 1000, // 30 minutes
  stalenessThresholdMs: 5 * 60 * 1000, // 5 minutes
  minTimeRangeMs: 60 * 60 * 1000, // 1 hour
  debug: false,
};
