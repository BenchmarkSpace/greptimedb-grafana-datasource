import { DataFrame, Field, FieldType } from '@grafana/data';

/**
 * Finds the time field in a DataFrame.
 * Looks for fields with FieldType.time or common time field names.
 *
 * @param frame - The DataFrame to search
 * @returns The index of the time field, or -1 if not found
 */
function findTimeFieldIndex(frame: DataFrame): number {
  // First, look for explicit time type
  const timeTypeIndex = frame.fields.findIndex((f) => f.type === FieldType.time);
  if (timeTypeIndex !== -1) {
    return timeTypeIndex;
  }

  // Fall back to common time field names
  const timeNames = ['time', 'timestamp', 'ts', '_time', 'datetime'];
  return frame.fields.findIndex((f) => timeNames.includes(f.name.toLowerCase()));
}

/**
 * Get timestamp in milliseconds from a value.
 */
function getTimeMs(value: unknown): number {
  return typeof value === 'number' ? value : new Date(value as string | Date).getTime();
}

/**
 * Binary search to find the first index where time >= target.
 * Assumes the array is sorted in ascending order.
 *
 * @param timeValues - Array of time values (sorted ascending)
 * @param target - Target time in ms
 * @returns Index of first element >= target, or array length if none found
 */
function binarySearchLowerBound(timeValues: unknown[], target: number): number {
  let left = 0;
  let right = timeValues.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const midTime = getTimeMs(timeValues[mid]);
    if (midTime < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

/**
 * Binary search to find the first index where time >= target (exclusive upper bound).
 * Assumes the array is sorted in ascending order.
 *
 * @param timeValues - Array of time values (sorted ascending)
 * @param target - Target time in ms
 * @returns Index of first element >= target, or array length if none found
 */
function binarySearchUpperBound(timeValues: unknown[], target: number): number {
  let left = 0;
  let right = timeValues.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const midTime = getTimeMs(timeValues[mid]);
    if (midTime < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

/**
 * Check if an array of time values is sorted in ascending order.
 * Only checks a sample for performance.
 */
function isSortedAscending(timeValues: unknown[]): boolean {
  if (timeValues.length <= 1) {
    return true;
  }

  // Check first few and last few elements as a heuristic
  const checkCount = Math.min(10, timeValues.length - 1);
  for (let i = 0; i < checkCount; i++) {
    if (getTimeMs(timeValues[i]) > getTimeMs(timeValues[i + 1])) {
      return false;
    }
  }

  // Also check near the end
  for (let i = timeValues.length - checkCount - 1; i < timeValues.length - 1; i++) {
    if (i >= 0 && getTimeMs(timeValues[i]) > getTimeMs(timeValues[i + 1])) {
      return false;
    }
  }

  return true;
}

/**
 * Filters DataFrame rows to only include data within a time range.
 * Uses binary search for sorted time series data (O(log n)), falls back to linear scan otherwise.
 *
 * @param frames - Array of DataFrames to filter
 * @param startTime - Start time in ms (inclusive)
 * @param endTime - End time in ms (exclusive)
 * @returns New array of filtered DataFrames
 */
export function filterDataFrameByTimeRange(
  frames: DataFrame[],
  startTime: number,
  endTime: number
): DataFrame[] {
  return frames.map((frame) => {
    const timeFieldIndex = findTimeFieldIndex(frame);

    // No time field found - return frame as-is
    if (timeFieldIndex === -1) {
      return frame;
    }

    const timeField = frame.fields[timeFieldIndex];
    const timeValues = timeField.values;

    // Empty frame - return as-is
    if (timeValues.length === 0) {
      return frame;
    }

    let startIdx: number;
    let endIdx: number;

    // Use binary search if data is sorted (common for time series)
    if (isSortedAscending(timeValues)) {
      startIdx = binarySearchLowerBound(timeValues, startTime);
      endIdx = binarySearchUpperBound(timeValues, endTime);

      // If all rows are valid, return original frame
      if (startIdx === 0 && endIdx === timeValues.length) {
        return frame;
      }

      // If no valid rows, return empty frame
      if (startIdx >= endIdx) {
        const emptyFields: Field[] = frame.fields.map((field) => ({
          ...field,
          values: [],
          config: { ...field.config },
        }));
        return {
          ...frame,
          fields: emptyFields,
          length: 0,
        };
      }

      // Create filtered fields using slice (efficient for contiguous range)
      const filteredFields: Field[] = frame.fields.map((field) => ({
        ...field,
        values: field.values.slice(startIdx, endIdx),
        config: { ...field.config },
      }));

      return {
        ...frame,
        fields: filteredFields,
        length: endIdx - startIdx,
      };
    }

    // Fallback to linear scan for unsorted data
    const validIndices: number[] = [];
    for (let i = 0; i < timeValues.length; i++) {
      const timeMs = getTimeMs(timeValues[i]);
      if (timeMs >= startTime && timeMs < endTime) {
        validIndices.push(i);
      }
    }

    // If all rows are valid, return original frame
    if (validIndices.length === timeValues.length) {
      return frame;
    }

    // Create filtered fields
    const filteredFields: Field[] = frame.fields.map((field) => ({
      ...field,
      values: validIndices.map((i) => field.values[i]),
      config: { ...field.config },
    }));

    return {
      ...frame,
      fields: filteredFields,
      length: validIndices.length,
    };
  });
}

/**
 * Merges multiple DataFrame arrays, deduplicating by time.
 * Combines data from cached and freshly fetched portions.
 *
 * @param frameSets - Array of frame sets with their time ranges
 * @returns Merged DataFrames with duplicates removed and sorted by time
 */
export function mergeDataFrames(
  ...frameSets: Array<{ data: DataFrame[]; startTime: number; endTime: number }>
): DataFrame[] {
  if (frameSets.length === 0) {
    return [];
  }
  if (frameSets.length === 1) {
    return frameSets[0].data;
  }

  // Sort by start time
  frameSets.sort((a, b) => a.startTime - b.startTime);

  // Group frames by refId/name for merging
  const framesByRef = new Map<string, DataFrame[]>();

  for (const { data } of frameSets) {
    for (const frame of data) {
      const key = frame.refId || frame.name || 'default';
      const existing = framesByRef.get(key) || [];
      existing.push(frame);
      framesByRef.set(key, existing);
    }
  }

  // Merge each group
  const result: DataFrame[] = [];
  for (const [, frames] of framesByRef) {
    if (frames.length === 1) {
      result.push(frames[0]);
    } else {
      result.push(mergeFramesWithSameRef(frames));
    }
  }

  return result;
}

/**
 * Merges multiple DataFrames with the same refId into one.
 * Deduplicates rows by timestamp and sorts by time.
 */
function mergeFramesWithSameRef(frames: DataFrame[]): DataFrame {
  if (frames.length === 0) {
    throw new Error('Cannot merge empty frame array');
  }
  if (frames.length === 1) {
    return frames[0];
  }

  const baseFrame = frames[0];
  const fieldMap = new Map<string, { field: Field; values: any[] }>();

  // Initialize from first frame
  for (const field of baseFrame.fields) {
    fieldMap.set(field.name, {
      field,
      values: [...field.values],
    });
  }

  // Find time field for deduplication
  const timeFieldIndex = findTimeFieldIndex(baseFrame);
  let timeFieldName: string | null = null;
  if (timeFieldIndex !== -1) {
    timeFieldName = baseFrame.fields[timeFieldIndex].name;
  }

  // Track seen timestamps for deduplication
  const seenTimestamps = new Set<number>();
  if (timeFieldName) {
    const timeValues = fieldMap.get(timeFieldName)?.values || [];
    for (const t of timeValues) {
      const timeMs = typeof t === 'number' ? t : new Date(t).getTime();
      seenTimestamps.add(timeMs);
    }
  }

  // Merge additional frames
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const frameTimeFieldIndex = timeFieldName
      ? frame.fields.findIndex((f) => f.name === timeFieldName)
      : -1;
    const frameTimeField = frameTimeFieldIndex !== -1 ? frame.fields[frameTimeFieldIndex] : null;

    for (let rowIdx = 0; rowIdx < frame.length; rowIdx++) {
      // Skip duplicate timestamps
      if (timeFieldName && frameTimeField) {
        const timestamp = frameTimeField.values[rowIdx];
        const timeMs = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
        if (seenTimestamps.has(timeMs)) {
          continue;
        }
        seenTimestamps.add(timeMs);
      }

      // Add row values to each field
      for (const field of frame.fields) {
        const existing = fieldMap.get(field.name);
        if (existing) {
          existing.values.push(field.values[rowIdx]);
        }
      }
    }
  }

  // Sort by time if we have a time field
  if (timeFieldName) {
    const timeField = fieldMap.get(timeFieldName);
    if (timeField && timeField.values.length > 0) {
      const indices = timeField.values
        .map((t, i) => ({
          t: typeof t === 'number' ? t : new Date(t).getTime(),
          i,
        }))
        .sort((a, b) => a.t - b.t)
        .map((x) => x.i);

      // Reorder all fields according to sorted indices
      for (const [name, { field, values }] of fieldMap) {
        fieldMap.set(name, {
          field,
          values: indices.map((i) => values[i]),
        });
      }
    }
  }

  // Build result frame
  const mergedFields: Field[] = [];
  for (const [, { field, values }] of fieldMap) {
    mergedFields.push({
      ...field,
      values,
      config: { ...field.config },
    });
  }

  return {
    ...baseFrame,
    fields: mergedFields,
    length: mergedFields[0]?.values.length || 0,
  };
}

/**
 * Estimates the memory size of DataFrames in bytes.
 * This is a rough estimate used for cache size management.
 *
 * @param frames - DataFrames to estimate
 * @returns Approximate size in bytes
 */
export function estimateDataFrameSize(frames: DataFrame[]): number {
  let totalSize = 0;

  for (const frame of frames) {
    for (const field of frame.fields) {
      const values = field.values;
      const length = values.length;

      // Estimate based on field type
      switch (field.type) {
        case FieldType.number:
          totalSize += length * 8; // 64-bit float
          break;
        case FieldType.time:
          totalSize += length * 8; // 64-bit timestamp
          break;
        case FieldType.string:
          // Estimate average string length
          for (const v of values) {
            if (typeof v === 'string') {
              totalSize += v.length * 2; // UTF-16
            }
          }
          break;
        case FieldType.boolean:
          totalSize += length; // 1 byte per boolean
          break;
        default:
          // Conservative estimate for other types
          totalSize += length * 16;
      }

      // Add overhead for field metadata
      totalSize += 100;
    }

    // Add overhead for frame metadata
    totalSize += 200;
  }

  return totalSize;
}
