import { AbstractLabelOperator, CoreApp, makeTimeRange } from '@grafana/data';
import { type TemplateSrv } from '@grafana/runtime';

import { defaultPyroscopeQueryType } from './dataquery';
import { interpolateLabelSelectorValue, normalizeQuery, PyroscopeDataSource } from './datasource';
import { defaultSettings, mockFetchPyroscopeDatasourceSettings } from './mocks';
import { type Query } from './types';

function setupDatasource() {
  mockFetchPyroscopeDatasourceSettings();
  const templateSrv = {
    replace: (query: string): string => {
      return query.replace(/\$var/g, 'interpolated');
    },
  } as unknown as TemplateSrv;
  return new PyroscopeDataSource(defaultSettings, templateSrv);
}

describe('Pyroscope data source', () => {
  describe('importing queries', () => {
    it('keeps all labels and values', async () => {
      const ds = setupDatasource();
      const queries = await ds.importFromAbstractQueries([
        {
          refId: 'A',
          labelMatchers: [
            { name: 'foo', operator: AbstractLabelOperator.Equal, value: 'bar' },
            { name: 'foo2', operator: AbstractLabelOperator.Equal, value: 'bar2' },
          ],
        },
      ]);
      expect(queries[0].labelSelector).toBe('{foo="bar", foo2="bar2"}');
    });
  });

  describe('exporting queries', () => {
    it('keeps all labels and values', async () => {
      const ds = setupDatasource();
      const queries = await ds.exportToAbstractQueries([
        {
          refId: 'A',
          labelSelector: '{foo="bar", foo2="bar2"}',
          queryType: 'both',
          profileTypeId: '',
          groupBy: [''],
          includeExemplars: false,
          includeHeatmap: false,
          heatmapType: 'individual',
        },
      ]);
      expect(queries).toMatchObject([
        {
          refId: 'A',
          labelMatchers: [
            { name: 'foo', operator: AbstractLabelOperator.Equal, value: 'bar' },
            { name: 'foo2', operator: AbstractLabelOperator.Equal, value: 'bar2' },
          ],
        },
      ]);
    });
  });

  describe('applyTemplateVariables', () => {
    it('should not update labelSelector if there are no template variables', () => {
      const ds = setupDatasource();
      const query = ds.applyTemplateVariables(defaultQuery({ labelSelector: `no var`, profileTypeId: 'no var' }), {});
      expect(query).toMatchObject({
        labelSelector: `no var`,
        profileTypeId: 'no var',
      });
    });

    it('should update labelSelector if there are template variables', () => {
      const ds = setupDatasource();
      const query = ds.applyTemplateVariables(
        defaultQuery({ labelSelector: `{$var="$var"}`, profileTypeId: '$var' }),
        {}
      );
      expect(query).toMatchObject({ labelSelector: `{interpolated="interpolated"}`, profileTypeId: 'interpolated' });
    });

    it('should interpolate multi-value variables in labelSelector as a regex alternation', () => {
      mockFetchPyroscopeDatasourceSettings();
      const templateSrv = {
        replace: (target: string, _scopedVars: unknown, format?: (value: string | string[]) => string): string => {
          const value = ['pod-1', 'pod-2'];
          return target.replace(/\$pod/g, format ? format(value) : `{${value.join(',')}}`);
        },
      } as unknown as TemplateSrv;
      const ds = new PyroscopeDataSource(defaultSettings, templateSrv);
      const query = ds.applyTemplateVariables(defaultQuery({ labelSelector: `{pod=~"$pod"}` }), {});
      expect(query.labelSelector).toBe(`{pod=~"pod-1|pod-2"}`);
    });
  });

  it('implements ad hoc variable support for keys', async () => {
    const ds = setupDatasource();
    jest.spyOn(ds, 'getResource').mockImplementationOnce(async (cb) => ['foo', 'bar', 'baz']);
    const keys = await ds.getTagKeys({
      filters: [],
      timeRange: makeTimeRange('2024-01-01T00:00:00', '2024-01-01T01:00:00'),
    });
    expect(keys).toEqual(['foo', 'bar', 'baz'].map((v) => ({ text: v })));
  });

  it('implements ad hoc variable support for values', async () => {
    const ds = setupDatasource();
    jest.spyOn(ds, 'getResource').mockImplementationOnce(async (path, params) => {
      expect(params?.label).toEqual('foo');
      return ['xyz', 'tuv'];
    });
    const keys = await ds.getTagValues({
      key: 'foo',
      filters: [],
      timeRange: makeTimeRange('2024-01-01T00:00:00', '2024-01-01T01:00:00'),
    });
    expect(keys).toEqual(['xyz', 'tuv'].map((v) => ({ text: v })));
  });
});

describe('interpolateLabelSelectorValue', () => {
  it('leaves a single value unchanged', () => {
    expect(interpolateLabelSelectorValue('pod.1')).toBe('pod.1');
    expect(interpolateLabelSelectorValue(['pod.1'])).toBe('pod.1');
  });

  it('joins multiple values with |', () => {
    expect(interpolateLabelSelectorValue(['pod-1', 'pod-2', 'pod-3'])).toBe('pod-1|pod-2|pod-3');
  });

  it('escapes regex special characters in multiple values', () => {
    expect(interpolateLabelSelectorValue(['a.b', 'c(d)'])).toBe('a\\\\.b|c\\\\(d\\\\)');
  });
});

describe('normalizeQuery', () => {
  it('correctly normalizes the query', () => {
    // We need the type assertion here because the query types are inherently wrong in explore.
    let normalized = normalizeQuery({} as Query);
    expect(normalized).toMatchObject({
      labelSelector: '{}',
      groupBy: [],
      queryType: 'profile',
    });

    normalized = normalizeQuery({
      labelSelector: '{app="myapp"}',
      groupBy: ['app'],
      queryType: 'metrics',
      profileTypeId: 'cpu',
      refId: '',
      includeExemplars: false,
      includeHeatmap: false,
      heatmapType: 'individual',
    });
    expect(normalized).toMatchObject({
      labelSelector: '{app="myapp"}',
      groupBy: ['app'],
      queryType: 'metrics',
      profileTypeId: 'cpu',
    });
  });

  it('correctly normalizes the query when in explore', () => {
    // We need the type assertion here because the query types are inherently wrong in explore.
    const normalized = normalizeQuery({} as Query, CoreApp.Explore);
    expect(normalized).toMatchObject({
      labelSelector: '{}',
      groupBy: [],
      queryType: 'both',
    });
  });
});

const defaultQuery = (query: Partial<Query>): Query => {
  return {
    refId: 'x',
    groupBy: [],
    labelSelector: '',
    profileTypeId: '',
    queryType: defaultPyroscopeQueryType,
    includeExemplars: false,
    includeHeatmap: false,
    heatmapType: 'individual',
    ...query,
  };
};
