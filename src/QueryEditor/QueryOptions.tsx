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
  // Neither selector reaches the metrics path: the backend passes them only to the
  // profile RPCs, so on a metrics query they are inert and disabling one of them would
  // withhold a field the server happily accepts. `both` still runs the profile leg,
  // which does reject the pair, so only `metrics` opts out.
  const selectorsApply = query.queryType !== 'metrics';
  // Pyroscope rejects a request that sets both, so the editor only ever offers one:
  // filling either field disables the other. The field holding the value stays enabled
  // so it can be cleared, and a link carrying both leaves neither disabled, which keeps
  // that state recoverable. The backend still rejects the pair for anything that
  // reaches it by another route.
  const traceIdDisabled = spanId !== '' && traceId === '';
  const spanIdDisabled = traceId !== '' && spanId === '';
  // Pyroscope only accepts a 128-bit W3C trace ID, so a pasted 16-hex span ID is a
  // guaranteed server-side rejection. Flag it before the query is sent. A value holding
  // a template variable is left alone, since it only resolves at query time.
  const traceIdFormatError =
    selectorsApply && traceId !== '' && !traceId.includes('$') && !/^[0-9a-fA-F]{32}$/.test(traceId)
      ? 'Trace ID must be exactly 32 hexadecimal characters.'
      : undefined;

  let collapsedInfo = [`Type: ${query.queryType}`];
  if (query.groupBy?.length) {
    collapsedInfo.push(`Group by: ${query.groupBy.join(', ')}`);
  }
  if (query.limit) {
    collapsedInfo.push(`Limit: ${query.limit}`);
  }
  if (selectorsApply && query.traceIdSelector?.length) {
    collapsedInfo.push(`Trace ID: ${query.traceIdSelector.join(', ')}`);
  }
  if (selectorsApply && query.spanSelector?.length) {
    collapsedInfo.push(`Span ID: ${query.spanSelector.join(', ')}`);
  }
  if (traceIdFormatError) {
    // Same reasoning: a deep link carrying a bad trace ID must say so while collapsed.
    collapsedInfo.push(traceIdFormatError);
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
          {selectorsApply && (
            <>
              <EditorField
                label={'Trace ID'}
                tooltip={
                  <>
                    Sets the trace ID from which to search for profiles. Cannot be combined with Span ID.
                  </>
                }
                disabled={traceIdDisabled}
                invalid={traceIdFormatError !== undefined}
                error={traceIdFormatError}
              >
                <Input
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
                    Sets the span ID from which to search for profiles. Cannot be combined with Trace ID.
                  </>
                }
                disabled={spanIdDisabled}
              >
                <Input
                  value={spanId}
                  type="string"
                  placeholder="64f170a95f537095"
                  onChange={(event: React.SyntheticEvent<HTMLInputElement>) => {
                    const value = event.currentTarget.value.trim();
                    onQueryChange({ ...query, spanSelector: value !== '' ? [value] : [] });
                  }}
                />
              </EditorField>
            </>
          )}
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
