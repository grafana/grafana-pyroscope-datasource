import { css } from '@emotion/css';
import * as React from 'react';

import { CoreApp, type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { config } from '@grafana/runtime';
import { useStyles2, RadioButtonGroup, MultiSelect, Input, InlineSwitch } from '@grafana/ui';

import type { HeatmapQueryType } from '../dataquery';
import { type Query } from '../types';

import { EditorField } from './EditorField';
import { QueryOptionGroup } from './QueryOptionGroup';
import { Stack } from './Stack';

export interface Props {
  query: Query;
  onQueryChange: (query: Query) => void;
  app?: CoreApp;
  labels?: string[];
}

const typeOptions: Array<{ value: Query['queryType']; label: string; description: string }> = [
  { value: 'metrics', label: 'Metric', description: 'Return aggregated metrics' },
  { value: 'profile', label: 'Profile', description: 'Return profile' },
  { value: 'both', label: 'Both', description: 'Return both metric and profile data' },
];

function getTypeOptions(app?: CoreApp) {
  if (app === CoreApp.Explore) {
    return typeOptions;
  }
  return typeOptions.filter((option) => option.value !== 'both');
}

/**
 * Base on QueryOptionGroup component from grafana/ui but that is not available yet.
 */
export function QueryOptions({ query, onQueryChange, app, labels }: Props) {
  const styles = useStyles2(getStyles);
  const typeOptions = getTypeOptions(app);
  const groupByOptions = labels
    ? labels.map((l) => ({
        label: l,
        value: l,
      }))
    : [];

  const spanId = query.spanSelector?.[0] ?? '';
  const traceId = query.traceIdSelector?.[0] ?? '';
  // Pyroscope rejects a request that sets both, so flag it in the editor rather than
  // waiting for the query to come back with an error.
  const selectorConflict = spanId !== '' && traceId !== '';
  const selectorConflictError = 'Trace ID and Span ID cannot be used together. Clear one of them.';

  let collapsedInfo = [`Type: ${query.queryType}`];
  if (query.groupBy?.length) {
    collapsedInfo.push(`Group by: ${query.groupBy.join(', ')}`);
  }
  if (query.limit) {
    collapsedInfo.push(`Limit: ${query.limit}`);
  }
  if (query.traceIdSelector?.length) {
    collapsedInfo.push(`Trace ID: ${query.traceIdSelector.join(', ')}`);
  }
  if (query.spanSelector?.length) {
    collapsedInfo.push(`Span ID: ${query.spanSelector.join(', ')}`);
  }
  if (selectorConflict) {
    // Options renders collapsed by default, so without this a deep link carrying both
    // selectors would fail with nothing on screen to explain why.
    collapsedInfo.push(selectorConflictError);
  }
  if (query.maxNodes) {
    collapsedInfo.push(`Max nodes: ${query.maxNodes}`);
  }
  if (query.includeExemplars) {
    collapsedInfo.push(`With exemplars`);
  }
  if (query.includeHeatmap) {
    collapsedInfo.push(`Heatmap: ${query.heatmapType || 'individual'}`);
  }

  return (
    <Stack gap={0} direction="column">
      <QueryOptionGroup title="Options" collapsedInfo={collapsedInfo}>
        <div className={styles.body}>
          <EditorField label={'Query Type'}>
            <RadioButtonGroup
              options={typeOptions}
              value={query.queryType}
              onChange={(value) => onQueryChange({ ...query, queryType: value })}
            />
          </EditorField>
          <EditorField
            label={'Group by'}
            tooltip={
              <>
                Used to group the metric result by a specific label or set of labels. Does not apply to profile query.
              </>
            }
          >
            <MultiSelect
              placeholder="Label"
              value={query.groupBy}
              allowCustomValue
              options={groupByOptions}
              onChange={(change) => {
                const changes = change.map((c: SelectableValue<string>) => {
                  return c.value!;
                });
                onQueryChange({ ...query, groupBy: changes });
              }}
            />
          </EditorField>
          <EditorField
            label={'Limit'}
            tooltip={
              <>
                When &quot;Group by&quot; is set, limits the maximum number of series to return. Does not apply to
                profile query.
              </>
            }
          >
            <Input
              value={query.limit || ''}
              type="number"
              placeholder="0"
              onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                let newValue = parseInt(event.currentTarget.value, 10);
                newValue = isNaN(newValue) ? 0 : newValue;
                onQueryChange({ ...query, limit: newValue });
              }}
            />
          </EditorField>
          <EditorField
            label={'Trace ID'}
            tooltip={
              <>
                Sets the trace ID from which to search for profiles. Applies to the profile only &mdash; the time
                series is not filtered. Cannot be combined with Span ID.
              </>
            }
            invalid={selectorConflict}
            error={selectorConflict ? selectorConflictError : undefined}
            validationMessageHorizontalOverflow
          >
            <Input
              id="pyroscope-trace-id"
              value={traceId}
              type="string"
              placeholder="7c9e66797425440de944be07fc1f90ae"
              onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                const value = event.currentTarget.value.trim();
                onQueryChange({ ...query, traceIdSelector: value !== '' ? [value] : [] });
              }}
            />
          </EditorField>
          <EditorField
            label={'Span ID'}
            tooltip={
              <>
                Sets the span ID from which to search for profiles. Applies to the profile only &mdash; the time
                series is not filtered. Cannot be combined with Trace ID.
              </>
            }
            invalid={selectorConflict}
            error={selectorConflict ? selectorConflictError : undefined}
            validationMessageHorizontalOverflow
          >
            <Input
              id="pyroscope-span-id"
              value={spanId}
              type="string"
              placeholder="64f170a95f537095"
              onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                const value = event.currentTarget.value.trim();
                onQueryChange({ ...query, spanSelector: value !== '' ? [value] : [] });
              }}
            />
          </EditorField>
          <EditorField label={'Max Nodes'} tooltip={<>Sets the maximum number of nodes to return in the flamegraph.</>}>
            <Input
              value={query.maxNodes || ''}
              type="number"
              placeholder="16384"
              onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                let newValue = parseInt(event.currentTarget.value, 10);
                newValue = isNaN(newValue) ? 0 : newValue;
                onQueryChange({ ...query, maxNodes: newValue });
              }}
            />
          </EditorField>
          <EditorField label={'Annotations'} tooltip={<>Include profiling annotations in the time series.</>}>
            <InlineSwitch
              value={query.annotations || false}
              onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                onQueryChange({ ...query, annotations: event.currentTarget.checked });
              }}
            />
          </EditorField>
          {config.featureToggles.profilesExemplars && (
            <EditorField label={'Exemplars'} tooltip={<>Include profile exemplars in the time series.</>}>
              <InlineSwitch
                value={query.includeExemplars || false}
                onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                  onQueryChange({ ...query, includeExemplars: event.currentTarget.checked });
                }}
              />
            </EditorField>
          )}
          {(config.featureToggles as Record<string, boolean | undefined>).profilesHeatmap && (
            <>
              <EditorField label={'Heatmap'} tooltip={<>Include heatmap visualization of profile data over time.</>}>
                <InlineSwitch
                  value={query.includeHeatmap || false}
                  onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                    onQueryChange({ ...query, includeHeatmap: event.currentTarget.checked });
                  }}
                />
              </EditorField>
              {query.includeHeatmap && (
                <EditorField label={'Heatmap Type'} tooltip={<>Select the type of heatmap aggregation.</>}>
                  <RadioButtonGroup
                    options={[
                      { value: 'individual', label: 'Individual', description: 'Show individual profile samples' },
                      { value: 'span', label: 'Span', description: 'Aggregate by span duration' },
                    ]}
                    value={query.heatmapType || 'individual'}
                    onChange={(value: HeatmapQueryType) => onQueryChange({ ...query, heatmapType: value })}
                  />
                </EditorField>
              )}
            </>
          )}
        </div>
      </QueryOptionGroup>
    </Stack>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    switchLabel: css({
      color: theme.colors.text.secondary,
      cursor: 'pointer',
      fontSize: theme.typography.bodySmall.fontSize,
      '&:hover': {
        color: theme.colors.text.primary,
      },
    }),
    body: css({
      display: 'flex',
      paddingTop: theme.spacing(2),
      gap: theme.spacing(2),
      flexWrap: 'wrap',
    }),
  };
};
