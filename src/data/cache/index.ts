// Cache types
export type {
  CacheKey,
  CacheEntry,
  CacheConfig,
  CacheStats,
  QuerySplitResult,
} from './types';
export { DEFAULT_CACHE_CONFIG } from './types';

// Cache manager
export { QueryCache } from './QueryCache';

// Query batching for multi-panel dashboards
export { QueryBatcher } from './QueryBatcher';

// Request deduplication for concurrent queries
export { RequestDeduplicator } from './RequestDeduplicator';

// Utilities
export { normalizeSqlForCache, createBoundedSql, hashString } from './sqlNormalizer';
export {
  filterDataFrameByTimeRange,
  mergeDataFrames,
  estimateDataFrameSize,
} from './dataFrameUtils';
