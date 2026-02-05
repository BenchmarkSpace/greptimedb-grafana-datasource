import React from 'react';
import { Switch, Field, Input, Select, HorizontalGroup } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { ConfigSection } from 'components/experimental/ConfigSection';
import { CHCacheConfig, CacheTimeUnit } from 'types/config';

interface CacheConfigProps {
  cacheConfig?: CHCacheConfig;
  onEnabledChange: (enabled: boolean) => void;
  onMaxSizeMBChange: (maxSizeMB: number) => void;
  onMaxAgeTTLMinutesChange: (maxAgeTTLMinutes: number) => void;
  onStalenessThresholdValueChange: (value: number) => void;
  onStalenessThresholdUnitChange: (unit: CacheTimeUnit) => void;
  onMinTimeRangeValueChange: (value: number) => void;
  onMinTimeRangeUnitChange: (unit: CacheTimeUnit) => void;
  onDebugChange: (debug: boolean) => void;
}

const timeUnitOptions: Array<SelectableValue<CacheTimeUnit>> = [
  { label: 'Seconds', value: 'seconds' },
  { label: 'Minutes', value: 'minutes' },
  { label: 'Hours', value: 'hours' },
];

export const CacheConfig = (props: CacheConfigProps) => {
  const {
    cacheConfig,
    onEnabledChange,
    onMaxSizeMBChange,
    onMaxAgeTTLMinutesChange,
    onStalenessThresholdValueChange,
    onStalenessThresholdUnitChange,
    onMinTimeRangeValueChange,
    onMinTimeRangeUnitChange,
    onDebugChange,
  } = props;

  const enabled = cacheConfig?.enabled ?? true;
  const maxSizeMB = cacheConfig?.maxSizeMB ?? 50;
  const maxAgeTTLMinutes = cacheConfig?.maxAgeTTLMinutes ?? 30;
  const stalenessThresholdValue = cacheConfig?.stalenessThresholdValue ?? 5;
  const stalenessThresholdUnit = cacheConfig?.stalenessThresholdUnit ?? 'seconds';
  const minTimeRangeValue = cacheConfig?.minTimeRangeValue ?? 15;
  const minTimeRangeUnit = cacheConfig?.minTimeRangeUnit ?? 'seconds';
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
            label="Staleness Threshold"
            description="Only data older than this threshold is cached. Recent data is always fetched fresh."
          >
            <HorizontalGroup>
              <Input
                type="number"
                value={stalenessThresholdValue}
                min={1}
                width={10}
                onChange={(e) => {
                  const value = parseInt(e.currentTarget.value, 10);
                  if (!isNaN(value) && value > 0) {
                    onStalenessThresholdValueChange(value);
                  }
                }}
              />
              <Select<CacheTimeUnit>
                options={timeUnitOptions}
                value={stalenessThresholdUnit}
                onChange={(v) => v.value && onStalenessThresholdUnitChange(v.value)}
                width={15}
              />
            </HorizontalGroup>
          </Field>

          <Field
            label="Min Time Range"
            description="Caching is only enabled for queries with time ranges larger than this"
          >
            <HorizontalGroup>
              <Input
                type="number"
                value={minTimeRangeValue}
                min={1}
                width={10}
                onChange={(e) => {
                  const value = parseInt(e.currentTarget.value, 10);
                  if (!isNaN(value) && value > 0) {
                    onMinTimeRangeValueChange(value);
                  }
                }}
              />
              <Select<CacheTimeUnit>
                options={timeUnitOptions}
                value={minTimeRangeUnit}
                onChange={(v) => v.value && onMinTimeRangeUnitChange(v.value)}
                width={15}
              />
            </HorizontalGroup>
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
