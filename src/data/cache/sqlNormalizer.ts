/**
 * Normalizes SQL query by removing time-specific values.
 * Used to generate consistent cache keys regardless of the time range.
 *
 * @param sql - The SQL query string
 * @returns Normalized SQL with time values replaced by placeholders
 */
export function normalizeSqlForCache(sql: string): string {
  let normalized = sql
    // Replace ISO timestamps (e.g., '2024-01-15T10:30:00.000Z')
    .replace(/'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?'/g, "'__TIME__'")
    // Replace date strings (e.g., '2024-01-15')
    .replace(/'\d{4}-\d{2}-\d{2}'/g, "'__DATE__'")
    // Replace $__fromTime and $__toTime macros
    .replace(/\$__fromTime/g, '__FROM_TIME__')
    .replace(/\$__toTime/g, '__TO_TIME__')
    // Replace $__fromTime_ms and $__toTime_ms macros
    .replace(/\$__fromTime_ms/g, '__FROM_TIME_MS__')
    .replace(/\$__toTime_ms/g, '__TO_TIME_MS__')
    // Replace Unix timestamps (10+ digit numbers that look like timestamps)
    .replace(/\b1[4-9]\d{8,11}\b/g, '__UNIX_TIME__')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Creates a SQL query with specific time bounds.
 * Replaces time macros with actual ISO timestamp values.
 *
 * @param templateSql - SQL with time macros ($__fromTime, $__toTime)
 * @param startTime - Start time in milliseconds since epoch
 * @param endTime - End time in milliseconds since epoch
 * @returns SQL with time macros replaced by actual values
 */
export function createBoundedSql(
  templateSql: string,
  startTime: number,
  endTime: number
): string {
  const startIso = new Date(startTime).toISOString();
  const endIso = new Date(endTime).toISOString();

  return templateSql
    .replace(/\$__fromTime/g, `'${startIso}'`)
    .replace(/\$__toTime/g, `'${endIso}'`);
}

/**
 * Simple hash function for generating cache keys.
 * Uses djb2 algorithm for fast, consistent hashing.
 *
 * @param str - String to hash
 * @returns Hexadecimal hash string
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char; // hash * 33 ^ char
  }
  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16);
}
