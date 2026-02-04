import { DataSourceJsonData, KeyValue } from '@grafana/data';

export interface CHConfig extends DataSourceJsonData {
  /**
   * The version of the plugin this config was saved with
   */
  version: string;

  host: string;
  port: number;
  protocol: Protocol;
  secure?: boolean;
  path?: string;

  tlsSkipVerify?: boolean;
  tlsAuth?: boolean;
  tlsAuthWithCACert?: boolean;

  username: string;

  defaultDatabase?: string;
  defaultTable?: string;

  connMaxLifetime?: string;
  dialTimeout?: string;
  maxIdleConns?: string;
  maxOpenConns?: string;
  queryTimeout?: string;
  validateSql?: boolean;

  /**
   * Enable filter validation to require at least one user-added filter
   */
  filterValidationEnabled?: boolean;

  logs?: CHLogsConfig;
  traces?: CHTracesConfig;

  aliasTables?: AliasTableEntry[];

  httpHeaders?: CHHttpHeader[];
  forwardGrafanaHeaders?: boolean;

  customSettings?: CHCustomSetting[];
  enableSecureSocksProxy?: boolean;

  /**
   * Query result caching configuration
   */
  cache?: CHCacheConfig;
}

interface CHSecureConfigProperties {
  password?: string;

  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}
export type CHSecureConfig = CHSecureConfigProperties | KeyValue<string>;

export interface CHHttpHeader {
  name: string;
  value: string;
  secure: boolean;
}

export interface CHCustomSetting {
  setting: string;
  value: string;
}

export interface CHLogsConfig {
  defaultDatabase?: string;
  defaultTable?: string;

  otelEnabled?: boolean;
  otelVersion?: string;

  timeColumn?: string;
  levelColumn?: string;
  messageColumn?: string;

  selectContextColumns?: boolean;
  contextColumns?: string[];
}

export interface CHTracesConfig {
  defaultDatabase?: string;
  defaultTable?: string;

  otelEnabled?: boolean;
  otelVersion?: string;

  traceIdColumn?: string;
  spanIdColumn?: string;
  operationNameColumn?: string;
  parentSpanIdColumn?: string;
  serviceNameColumn?: string;
  durationColumn?: string;
  durationUnit?: string;
  startTimeColumn?: string;
  tagsColumn?: string;
  serviceTagsColumn?: string;
  eventsColumnPrefix?: string;
}

export interface AliasTableEntry {
  targetDatabase: string;
  targetTable: string;
  aliasDatabase: string;
  aliasTable: string;
}

export enum Protocol {
  Native = 'native',
  Http = 'http',
}

/**
 * Query result caching configuration
 */
export interface CHCacheConfig {
  /** Enable/disable caching (default: true) */
  enabled?: boolean;
  /** Maximum cache size in MB (default: 50) */
  maxSizeMB?: number;
  /** Maximum age of cache entries in minutes (default: 30) */
  maxAgeTTLMinutes?: number;
  /** Data older than this (minutes before now) is cacheable (default: 5) */
  stalenessThresholdMinutes?: number;
  /** Minimum time range in hours to enable caching (default: 1) */
  minTimeRangeHours?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}
