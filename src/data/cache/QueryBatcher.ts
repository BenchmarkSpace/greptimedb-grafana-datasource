import { DataFrame } from '@grafana/data';
import { Observable, Subject, timer } from 'rxjs';
import { map, take, filter } from 'rxjs/operators';

interface PendingQuery {
  id: string;
  table: string;
  database: string;
  columns: string[];
  startTime: number;
  endTime: number;
  interval: string;
  resolve: (data: DataFrame[]) => void;
  reject: (error: Error) => void;
}

interface BatchedQueryResult {
  batchId: string;
  data: DataFrame[];
  columns: string[];
}

/**
 * QueryBatcher combines multiple queries to the same table into a single
 * database request, dramatically reducing round-trips for dashboards with
 * many panels querying the same data source.
 *
 * How it works:
 * 1. Queries are collected for a short window (e.g., 10ms)
 * 2. Queries to the same table with same time range are merged
 * 3. A single combined query fetches all columns at once
 * 4. Results are split and distributed to individual callers
 */
export class QueryBatcher {
  private pendingQueries: Map<string, PendingQuery[]> = new Map();
  private batchTimeout: number;
  private executeFn: (sql: string) => Promise<DataFrame[]>;
  private debug: boolean;
  private batchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    executeFn: (sql: string) => Promise<DataFrame[]>,
    options: { batchTimeout?: number; debug?: boolean } = {}
  ) {
    this.executeFn = executeFn;
    this.batchTimeout = options.batchTimeout ?? 10; // 10ms default batch window
    this.debug = options.debug ?? false;
  }

  /**
   * Generate a batch key for grouping queries
   */
  private getBatchKey(database: string, table: string, startTime: number, endTime: number, interval: string): string {
    return `${database}:${table}:${startTime}:${endTime}:${interval}`;
  }

  /**
   * Add a query to the batch. Returns a promise that resolves when the
   * batched query completes and the relevant columns are extracted.
   */
  addQuery(
    database: string,
    table: string,
    columns: string[],
    startTime: number,
    endTime: number,
    interval: string
  ): Promise<DataFrame[]> {
    return new Promise((resolve, reject) => {
      const batchKey = this.getBatchKey(database, table, startTime, endTime, interval);
      const queryId = `${batchKey}:${columns.join(',')}:${Date.now()}`;

      const pendingQuery: PendingQuery = {
        id: queryId,
        table,
        database,
        columns,
        startTime,
        endTime,
        interval,
        resolve,
        reject,
      };

      // Add to pending queries for this batch
      if (!this.pendingQueries.has(batchKey)) {
        this.pendingQueries.set(batchKey, []);
      }
      this.pendingQueries.get(batchKey)!.push(pendingQuery);

      this.log(`Added query to batch ${batchKey}, columns: ${columns.join(', ')}`);

      // Start or reset the batch timer
      if (!this.batchTimers.has(batchKey)) {
        const timerId = setTimeout(() => {
          this.executeBatch(batchKey);
        }, this.batchTimeout);
        this.batchTimers.set(batchKey, timerId);
      }
    });
  }

  /**
   * Execute all pending queries for a batch key
   */
  private async executeBatch(batchKey: string): Promise<void> {
    const queries = this.pendingQueries.get(batchKey);
    this.pendingQueries.delete(batchKey);
    this.batchTimers.delete(batchKey);

    if (!queries || queries.length === 0) {
      return;
    }

    // Collect all unique columns needed
    const allColumns = new Set<string>();
    allColumns.add('time'); // Always include time
    for (const q of queries) {
      for (const col of q.columns) {
        allColumns.add(col);
      }
    }

    const firstQuery = queries[0];
    const columnList = Array.from(allColumns);

    this.log(`Executing batched query for ${queries.length} panels, ${columnList.length} columns`);

    // Build combined SQL
    const startIso = new Date(firstQuery.startTime).toISOString();
    const endIso = new Date(firstQuery.endTime).toISOString();

    // Build SELECT clause with all columns
    const selectClauses = columnList.map((col) => {
      if (col === 'time') {
        return `date_bin('${firstQuery.interval}', ts) AS "time"`;
      }
      // Assume AVG aggregation - could be made configurable
      return `AVG("${col}") AS "${col}"`;
    });

    const sql = `
      SELECT ${selectClauses.join(', ')}
      FROM "${firstQuery.database}"."${firstQuery.table}"
      WHERE ts >= '${startIso}' AND ts <= '${endIso}'
      GROUP BY date_bin('${firstQuery.interval}', ts)
      ORDER BY "time" ASC
    `;

    try {
      const startTime = performance.now();
      const results = await this.executeFn(sql);
      this.log(`Batched query completed in ${(performance.now() - startTime).toFixed(0)}ms`);

      // Distribute results to each waiting query
      for (const query of queries) {
        const filteredFrames = this.extractColumnsFromFrames(results, query.columns);
        query.resolve(filteredFrames);
      }
    } catch (error) {
      // Reject all waiting queries
      for (const query of queries) {
        query.reject(error as Error);
      }
    }
  }

  /**
   * Extract specific columns from DataFrames
   */
  private extractColumnsFromFrames(frames: DataFrame[], columns: string[]): DataFrame[] {
    return frames.map((frame) => {
      const timeField = frame.fields.find((f) => f.name === 'time' || f.name === 'Time');
      const selectedFields = frame.fields.filter(
        (f) => f.name === 'time' || f.name === 'Time' || columns.includes(f.name)
      );

      return {
        ...frame,
        fields: selectedFields,
      };
    });
  }

  /**
   * Force flush all pending batches immediately
   */
  flushAll(): void {
    for (const [batchKey, timerId] of this.batchTimers) {
      clearTimeout(timerId);
      this.executeBatch(batchKey);
    }
  }

  /**
   * Update debug setting
   */
  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  private log(message: string): void {
    if (this.debug) {
      console.warn(`[QueryBatcher] ${message}`);
    }
  }
}
