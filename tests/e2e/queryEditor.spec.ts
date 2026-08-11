import { test, expect, type ExplorePage } from '@grafana/plugin-e2e';

const PLUGIN_TYPE = 'grafana-pyroscope-datasource';

// Use a tight, recent time window so tests work both locally (after `npm run server`)
// and in CI, where Pyroscope starts fresh and needs ~1 minute to begin self-profiling.
// `now-15m` is forgiving for both scenarios.
const RANGE_FROM = 'now-15m';
const RANGE_TO = 'now';

type ExploreOpts = {
  profileTypeId?: string;
  labelSelector?: string;
  queryType?: 'metrics' | 'profile' | 'both';
  spanSelector?: string[];
  traceIdSelector?: string[];
};

// Explore serialises the whole query object into the `panes` URL param, which is what
// makes every query field deep-linkable without any URL handling in the plugin.
function exploreUrl(uid: string, opts: ExploreOpts = {}): string {
  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid },
    labelSelector: opts.labelSelector ?? '{}',
    queryType: opts.queryType ?? 'both',
    groupBy: [],
    spanSelector: opts.spanSelector ?? [],
    traceIdSelector: opts.traceIdSelector ?? [],
    includeExemplars: false,
  };
  if (opts.profileTypeId) {
    query.profileTypeId = opts.profileTypeId;
  }
  const panes = {
    a: {
      datasource: uid,
      queries: [query],
      range: { from: RANGE_FROM, to: RANGE_TO },
    },
  };
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}`;
}

const CPU_PROFILE = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds';

// Backend warmup (waiting for Pyroscope to finish ingesting its first profile)
// is handled once for the whole run by `tests/e2e/global-setup.ts`, so every
// test in this file can assume `profileTypes` is non-empty and the "both"
// query returns both the metrics frame and the flamegraph frame.

// Read /api/ds/query response bodies inside the predicate to avoid CDP buffer eviction.
// TODO: remove once @grafana/plugin-e2e exposes body reading natively.
function waitForQueryDataResponseWithBody(explorePage: ExplorePage) {
  let body: { results?: Record<string, { status?: number; frames?: Array<{ schema?: { name?: string; meta?: { preferredVisualisationType?: string } } }>; error?: string }> } | null = null;
  const responsePromise = explorePage.waitForQueryDataResponse(async (r) => {
    if (!r.ok()) {
      return false;
    }
    const b = await r.json().catch(() => null);
    if (!b || typeof b !== 'object' || !('results' in b)) {
      return false;
    }
    body = b as typeof body extends infer T ? T : never;
    return true;
  });
  return { responsePromise, getBody: () => body };
}

test.describe('Query editor', () => {
  test.describe('rendering', () => {
    test(
      'smoke: should render query editor',
      { tag: '@plugins' },
      async ({ page, readProvisionedDataSource }) => {
        const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
        await page.goto(exploreUrl(ds.uid));
        // The profile-type cascader is the most distinctive element of the editor.
        // The cascader input only exposes a `placeholder`, so use `getByPlaceholder`
        // — `getByRole('textbox', { name })` doesn't include placeholder in the
        // computed accessible name on Grafana <= 13.0 (different host wrapper).
        await expect(page.getByPlaceholder('Select profile type')).toBeVisible();
      }
    );

    test('should render the profile type cascader', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      const cascader = page.getByPlaceholder('Select profile type');
      await expect(cascader).toBeVisible();
      // The plugin auto-selects a default profile type after profileTypes load
      // (preferring process_cpu when available, as Pyroscope self-profiles in CPU).
      await expect(cascader).not.toHaveValue('');
    });

    test('should render the label selector (Monaco) editor', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      await expect(page.getByRole('textbox', { name: /Editor content/ })).toBeVisible();
    });

    test('should render the Options collapser', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      await expect(page.getByRole('button', { name: /^Options/ })).toBeVisible();
    });

    test('should reveal all query options when Options is expanded', async ({
      page,
      readProvisionedDataSource,
    }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      await page.getByRole('button', { name: /^Options/ }).click();

      // Query Type radios — "Both" only appears in Explore (CoreApp.Explore).
      await expect(page.getByRole('radio', { name: 'Metric' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Profile' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Both' })).toBeVisible();

      // Both selector inputs carry an id, so the wrapping Field label is their
      // accessible name.
      await expect(page.getByRole('textbox', { name: 'Trace ID' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Span ID' })).toBeVisible();
    });
  });

  test.describe('trace ID', () => {
    const TRACE_ID = '7c9e66797425440de944be07fc1f90ae';
    const SPAN_ID = '64f170a95f537095';

    test('a trace ID in the Explore URL round-trips into the editor', async ({
      page,
      readProvisionedDataSource,
    }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid, { traceIdSelector: [TRACE_ID] }));

      // Options renders collapsed, so the summary has to advertise the trace ID without
      // the user expanding anything — otherwise a deep link gives no sign it was applied.
      await expect(page.getByText(`Trace ID: ${TRACE_ID}`)).toBeVisible();

      await page.getByRole('button', { name: /^Options/ }).click();
      await expect(page.getByRole('textbox', { name: 'Trace ID' })).toHaveValue(TRACE_ID);
    });

    test('the trace ID reaches the query request', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });

      // The only cross-language check that src/dataquery.ts and the Go queryModel agree
      // on the field name. A mismatch is dropped silently at unmarshal.
      const requestPromise = page.waitForRequest(
        (r) => r.url().includes('/api/ds/query') && r.method() === 'POST'
      );
      await page.goto(exploreUrl(ds.uid, { queryType: 'profile', profileTypeId: CPU_PROFILE, traceIdSelector: [TRACE_ID] }));

      const payload = (await requestPromise).postDataJSON();
      expect(payload.queries[0].traceIdSelector).toEqual([TRACE_ID]);
    });

    test('setting both Trace ID and Span ID surfaces a conflict error', async ({
      page,
      readProvisionedDataSource,
    }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid, { traceIdSelector: [TRACE_ID], spanSelector: [SPAN_ID] }));
      await page.getByRole('button', { name: /^Options/ }).click();
      await expect(page.getByText(/cannot be used together/).first()).toBeVisible();
    });
  });

  test.describe('query type modes', () => {
    // Grafana's RadioButtonGroup renders as <input type="radio"> wrapped in a styled label.
    // `toBeChecked()` recursively retries through the flamegraph DOM and overflows the stack;
    // asserting on the `checked` filter via `getByRole` is reliable.
    test('"Both" mode is selected by default in Explore', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid, { queryType: 'both' }));
      await page.getByRole('button', { name: /^Options/ }).click();
      await expect(page.getByRole('radio', { name: 'Both', checked: true })).toBeVisible();
    });

    test('clicking "Metric" radio selects metrics mode', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      await page.getByRole('button', { name: /^Options/ }).click();
      await page.getByRole('radio', { name: 'Metric' }).click();
      await expect(page.getByRole('radio', { name: 'Metric', checked: true })).toBeVisible();
    });

    test('clicking "Profile" radio selects profile mode', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      await page.getByRole('button', { name: /^Options/ }).click();
      await page.getByRole('radio', { name: 'Profile' }).click();
      await expect(page.getByRole('radio', { name: 'Profile', checked: true })).toBeVisible();
    });
  });
});

test.describe('Query editor with fixture data', () => {
  // Pyroscope self-profiles on startup, so a live container always has profile data
  // for service_name=pyroscope. These tests verify the data source surfaces that data
  // correctly. Run serially to avoid hammering the backend in parallel.
  test.describe.configure({ mode: 'serial' });

  test('"both" query returns both a time series and a flamegraph frame', async ({
    page,
    explorePage,
    readProvisionedDataSource,
  }) => {
    const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    const { responsePromise, getBody } = waitForQueryDataResponseWithBody(explorePage);
    await page.goto(exploreUrl(ds.uid, { queryType: 'both', profileTypeId: CPU_PROFILE }));
    await responsePromise;

    const body = getBody();
    expect(body?.results?.A?.status).toBe(200);
    const frames = body?.results?.A?.frames ?? [];
    expect(frames.length).toBeGreaterThanOrEqual(2);

    const visualisations = frames
      .map((f) => f.schema?.meta?.preferredVisualisationType)
      .filter((v): v is string => typeof v === 'string');
    expect(visualisations).toEqual(expect.arrayContaining(['graph', 'flamegraph']));
  });

  test('"metrics" query returns only a time series frame', async ({
    page,
    explorePage,
    readProvisionedDataSource,
  }) => {
    const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    const { responsePromise, getBody } = waitForQueryDataResponseWithBody(explorePage);
    await page.goto(exploreUrl(ds.uid, { queryType: 'metrics', profileTypeId: CPU_PROFILE }));
    await responsePromise;

    const body = getBody();
    expect(body?.results?.A?.status).toBe(200);
    const frames = body?.results?.A?.frames ?? [];
    expect(frames.length).toBeGreaterThanOrEqual(1);
    const visualisations = frames
      .map((f) => f.schema?.meta?.preferredVisualisationType)
      .filter((v): v is string => typeof v === 'string');
    expect(visualisations).toContain('graph');
    expect(visualisations).not.toContain('flamegraph');
  });

  test('"profile" query returns only a flamegraph frame', async ({
    page,
    explorePage,
    readProvisionedDataSource,
  }) => {
    const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    const { responsePromise, getBody } = waitForQueryDataResponseWithBody(explorePage);
    await page.goto(exploreUrl(ds.uid, { queryType: 'profile', profileTypeId: CPU_PROFILE }));
    await responsePromise;

    const body = getBody();
    expect(body?.results?.A?.status).toBe(200);
    const frames = body?.results?.A?.frames ?? [];
    expect(frames.length).toBeGreaterThanOrEqual(1);
    const visualisations = frames
      .map((f) => f.schema?.meta?.preferredVisualisationType)
      .filter((v): v is string => typeof v === 'string');
    expect(visualisations).toContain('flamegraph');
    expect(visualisations).not.toContain('graph');
  });

  test('profileTypes resource endpoint returns the available types', async ({
    page,
    readProvisionedDataSource,
  }) => {
    const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });

    type ProfileType = { name?: string; id?: string };
    let body: ProfileType[] = [];
    const responsePromise = page.waitForResponse(async (r) => {
      if (!r.url().includes(`/resources/profileTypes`) || !r.ok()) {
        return false;
      }
      const b = await r.json().catch(() => null);
      if (!Array.isArray(b)) {
        return false;
      }
      body = b as ProfileType[];
      return true;
    });

    await page.goto(exploreUrl(ds.uid));
    await responsePromise;

    expect(body.length).toBeGreaterThan(0);
    // Pyroscope ships with a fixed set of standard profile types; CPU is one of them.
    expect(body.some((p) => p.id?.startsWith('process_cpu'))).toBe(true);
  });
});
