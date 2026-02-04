import React from 'react';
import { Switch, Field, Input } from '@grafana/ui';
import { ConfigSection } from 'components/experimental/ConfigSection';
import { CHCacheConfig } from 'types/config';

interface CacheConfigProps {
  cacheConfig?: CHCacheConfig;
  onEnabledChange: (enabled: boolean) => void;
  onMaxSizeMBChange: (maxSizeMB: number) => void;
  onMaxAgeTTLMinutesChange: (maxAgeTTLMinutes: number) => void;
  onStalenessThresholdMinutesChange: (stalenessThresholdMinutes: number) => void;
  onMinTimeRangeHoursChange: (minTimeRangeHours: number) => void;
  onDebugChange: (debug: boolean) => void;
}

export const CacheConfig = (props: CacheConfigProps) => {
  const {
    cacheConfig,
    onEnabledChange,
    onMaxSizeMBChange,
    onMaxAgeTTLMinutesChange,
    onStalenessThresholdMinutesChange,
    onMinTimeRangeHoursChange,
    onDebugChange,
  } = props;

  const enabled = cacheConfig?.enabled ?? true;
  const maxSizeMB = cacheConfig?.maxSizeMB ?? 50;
  const maxAgeTTLMinutes = cacheConfig?.maxAgeTTLMinutes ?? 30;
  const stalenessThresholdMinutes = cacheConfig?.stalenessThresholdMinutes ?? 5;
  const minTimeRangeHours = cacheConfig?.minTimeRangeHours ?? 1;
  const debug = cacheConfig?.debug ?? false;

  return (
    <ConfigSection
      title="Query Caching"
      description="Cache historical query results to improve performance on large time ranges. Cached data reduces load on the database when refreshing dashboards."
    >
      <Field
        label="Enable Caching"
        description="Enable query result caching for large time range queries"
      >
        <Switch
          className="gf-form"
          value={enabled}
          onChange={(e) => onEnabledChange(e.currentTarget.checked)}
          role="checkbox"
        />
      </Field>

      {enabled && (
        <>
          <Field
            label="Max Cache Size (MB)"
            description="Maximum memory used for caching query results"
          >
            <Input
              type="number"
              value={maxSizeMB}
              min={1}
              max={500}
              width={15}
              onChange={(e) => {
                const value = parseInt(e.currentTarget.value, 10);
                if (!isNaN(value) && value > 0) {
                  onMaxSizeMBChange(value);
                }
              }}
            />
          </Field>

          <Field
            label="Cache TTL (minutes)"
            description="Maximum time to keep cached data before it expires"
          >
            <Input
              type="number"
              value={maxAgeTTLMinutes}
              min={1}
              max={1440}
              width={15}
              onChange={(e) => {
                const value = parseInt(e.currentTarget.value, 10);
                if (!isNaN(value) && value > 0) {
                  onMaxAgeTTLMinutesChange(value);
                }
              }}
            />
          </Field>

          <Field
            label="Staleness Threshold (minutes)"
            description="Only data older than this threshold is cached. Recent data is always fetched fresh."
          >
            <Input
              type="number"
              value={stalenessThresholdMinutes}
              min={1}
              max={60}
              width={15}
              onChange={(e) => {
                const value = parseInt(e.currentTarget.value, 10);
                if (!isNaN(value) && value > 0) {
                  onStalenessThresholdMinutesChange(value);
                }
              }}
            />
          </Field>

          <Field
            label="Min Time Range (hours)"
            description="Caching is only enabled for queries with time ranges larger than this"
          >
            <Input
              type="number"
              value={minTimeRangeHours}
              min={0.5}
              max={168}
              step={0.5}
              width={15}
              onChange={(e) => {
                const value = parseFloat(e.currentTarget.value);
                if (!isNaN(value) && value > 0) {
                  onMinTimeRangeHoursChange(value);
                }
              }}
            />
          </Field>

          <Field
            label="Debug Logging"
            description="Log cache operations to browser console for debugging"
          >
            <Switch
              className="gf-form"
              value={debug}
              onChange={(e) => onDebugChange(e.currentTarget.checked)}
              role="checkbox"
            />
          </Field>
        </>
      )}
    </ConfigSection>
  );
};
