import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CoreApp, PluginType } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';

import { PyroscopeDataSource } from '../datasource';
import { mockFetchPyroscopeDatasourceSettings } from '../mocks';
import { type ProfileTypeMessage, type Query } from '../types';

import { type Props, QueryEditor } from './QueryEditor';

describe('createSelector (UTF-8 label names)', () => {
  beforeEach(() => {
    mockFetchPyroscopeDatasourceSettings();
  });

  it('should include UTF-8 label name in the selector sent to getLabelNames', async () => {
    const ds = setupDs();
    render(
      <QueryEditor
        query={{
          queryType: 'both',
          labelSelector: '{"k8s.namespace"="prod"}',
          profileTypeId: 'process_cpu:cpu',
          refId: 'A',
          maxNodes: 1000,
          groupBy: [],
          includeExemplars: false,
          includeHeatmap: false,
          heatmapType: 'individual',
        }}
        datasource={ds}
        onChange={jest.fn()}
        onRunQuery={() => {}}
        app={CoreApp.Explore}
      />
    );

    await waitFor(() => {
      expect(ds.getLabelNames).toHaveBeenCalledWith(
        expect.stringContaining('"k8s.namespace"="prod"'),
        expect.any(Number),
        expect.any(Number)
      );
    });
  });

  it('should include both UTF-8 and regular label names in the selector sent to getLabelNames', async () => {
    const ds = setupDs();
    render(
      <QueryEditor
        query={{
          queryType: 'both',
          labelSelector: '{"k8s.namespace"="prod",foo="bar"}',
          profileTypeId: 'process_cpu:cpu',
          refId: 'A',
          maxNodes: 1000,
          groupBy: [],
          includeExemplars: false,
          includeHeatmap: false,
          heatmapType: 'individual',
        }}
        datasource={ds}
        onChange={jest.fn()}
        onRunQuery={() => {}}
        app={CoreApp.Explore}
      />
    );

    await waitFor(() => {
      expect(ds.getLabelNames).toHaveBeenCalledWith(
        expect.stringMatching(/\"k8s\.namespace\"="prod".*foo="bar"|foo="bar".*\"k8s\.namespace\"="prod"/),
        expect.any(Number),
        expect.any(Number)
      );
    });
  });
});

describe('QueryEditor', () => {
  beforeEach(() => {
    mockFetchPyroscopeDatasourceSettings();
  });

  it('should render without error', async () => {
    setup();

    // wait for CodeEditor
    expect(await screen.findByTestId(selectors.components.CodeEditor.container)).toBeDefined();
    await waitFor(() => {
      expect(screen.getByDisplayValue('process_cpu-cpu')).toBeDefined();
    });
  });

  it('should render without error if empty profileTypes', async () => {
    const ds = setupDs();
    ds.getProfileTypes = jest.fn().mockResolvedValue([]);
    setup({
      props: {
        datasource: ds,
        query: {
          queryType: 'both',
          labelSelector: '',
          profileTypeId: '',
          refId: 'A',
          maxNodes: 1000,
          groupBy: [],
          includeExemplars: false,
          includeHeatmap: false,
          heatmapType: 'individual',
        },
      },
    });

    expect(await screen.findByPlaceholderText('No profile types found')).toBeDefined();
  });

  it('should render options', async () => {
    setup();
    await openOptions();
    expect(screen.getByText(/Metric/)).toBeDefined();
    expect(screen.getByText(/Profile/)).toBeDefined();
    expect(screen.getByText(/Both/)).toBeDefined();

    expect(screen.getByText(/Group by/)).toBeDefined();
  });

  it('should render correct options outside of explore', async () => {
    setup({ props: { app: CoreApp.Dashboard } });
    await openOptions();
    expect(screen.getByText(/Metric/)).toBeDefined();
    expect(screen.getByText(/Profile/)).toBeDefined();
    expect(screen.queryAllByText(/Both/).length).toBe(0);
  });

  it('should render the Trace ID and Span ID fields', async () => {
    setup();
    await openOptions();
    expect(screen.getByLabelText('Trace ID')).toBeDefined();
    expect(screen.getByLabelText('Span ID')).toBeDefined();
  });

  it('should show an existing traceIdSelector value', async () => {
    setup({ props: { query: { ...baseQuery, traceIdSelector: ['7c9e66797425440de944be07fc1f90ae'] } } });
    await openOptions();
    expect(screen.getByLabelText('Trace ID')).toHaveValue('7c9e66797425440de944be07fc1f90ae');
  });

  it('should show an existing spanSelector value', async () => {
    setup({ props: { query: { ...baseQuery, spanSelector: ['64f170a95f537095'] } } });
    await openOptions();
    expect(screen.getByLabelText('Span ID')).toHaveValue('64f170a95f537095');
  });

  // userEvent.paste rather than type: the Input is controlled by a `query` prop that
  // never updates here, so type() would fire one onChange per keystroke, each carrying
  // a single character.
  it('should emit traceIdSelector when a trace ID is entered', async () => {
    const { onChange } = setup();
    await openOptions();
    await userEvent.click(screen.getByLabelText('Trace ID'));
    await userEvent.paste('7c9e66797425440de944be07fc1f90ae');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ traceIdSelector: ['7c9e66797425440de944be07fc1f90ae'] })
    );
  });

  it('should emit spanSelector when a span ID is entered', async () => {
    const { onChange } = setup();
    await openOptions();
    await userEvent.click(screen.getByLabelText('Span ID'));
    await userEvent.paste('64f170a95f537095');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ spanSelector: ['64f170a95f537095'] }));
  });

  it('should show a conflict error when both Trace ID and Span ID are set', async () => {
    setup({
      props: {
        query: {
          ...baseQuery,
          traceIdSelector: ['7c9e66797425440de944be07fc1f90ae'],
          spanSelector: ['64f170a95f537095'],
        },
      },
    });
    await openOptions();
    expect(screen.getAllByText(/cannot be used together/).length).toBeGreaterThan(0);
  });
});

async function openOptions() {
  const options = screen.getByText(/Options/);
  expect(options).toBeDefined();
  await userEvent.click(options);
}

function setupDs() {
  const ds = new PyroscopeDataSource({
    name: 'test',
    uid: 'test',
    type: PluginType.datasource,
    access: 'proxy',
    jsonData: {},
    meta: {
      name: '',
      id: '',
      type: PluginType.datasource,
      baseUrl: '',
      info: {
        author: {
          name: '',
        },
        description: '',
        links: [],
        logos: {
          large: '',
          small: '',
        },
        screenshots: [],
        updated: '',
        version: '',
      },
      module: '',
    },
    readOnly: false,
  });

  ds.getProfileTypes = jest.fn().mockResolvedValue([
    {
      label: 'process_cpu - cpu',
      id: 'process_cpu:cpu',
    },
    {
      label: 'memory',
      id: 'memory:memory',
    },
  ] as ProfileTypeMessage[]);

  ds.getLabelNames = jest.fn().mockResolvedValue(['label_one']);

  return ds;
}

const baseQuery: Query = {
  queryType: 'both',
  labelSelector: '',
  profileTypeId: 'process_cpu:cpu',
  refId: 'A',
  maxNodes: 1000,
  groupBy: [],
  limit: 42,
  includeExemplars: false,
  includeHeatmap: false,
  heatmapType: 'individual',
};

function setup(options: { props: Partial<Props> } = { props: {} }) {
  const onChange = jest.fn();
  const utils = render(
    <QueryEditor
      query={baseQuery}
      datasource={setupDs()}
      onChange={onChange}
      onRunQuery={() => {}}
      app={CoreApp.Explore}
      {...options.props}
    />
  );
  return { ...utils, onChange };
}
