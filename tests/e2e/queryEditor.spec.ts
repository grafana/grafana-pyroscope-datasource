import { test, expect, type ExplorePage } from '@grafana/plugin-e2e';
import { type Locator, type Page } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-pyroscope-datasource';

// Use a tight, recent time window so tests work both locally (after `npm run server`)
// and in CI, where Pyroscope starts fresh and needs ~1 minute to begin self-profiling.
// `now-15m` is forgiving for both scenarios.
const RANGE_FROM = 'now-15m';
const RANGE_TO = 'now';

// Grafana 13 migrated query editor row selectors from aria-label to data-testid
// (https://github.com/grafana/grafana/pull/121784). This helper matches both
// shapes so tests work across versions.
function getQueryEditorRow(page: Page, refId: string): Locator {
  return page
    .locator('[data-testid="data-testid Query editor row"], [aria-label="Query editor row"]')
    .filter({
      has: page.locator(
        `[data-testid="data-testid Query editor row title ${refId}"], [aria-label="Query editor row title ${refId}"]`
      ),
    });
}

// The ProfileTypesCascader component wraps @grafana/ui's Cascader in a div with
// this data-testid. The Cascader's underlying input rendering changed between
// Grafana versions (rc-cascader v2 → v3 changed from input[placeholder] to a
// combobox input with a sibling span for the placeholder text). Using the
// wrapper data-testid keeps locators stable across all Grafana versions.
function getProfileTypeCascader(page: Page): Locator {
  return page.locator('[data-testid="pyroscope-profile-type-cascader"]');
}

type ExploreOpts = {
  profileTypeId?: string;
  labelSelector?: string;
  queryType?: 'metrics' | 'profile' | 'both';
};

function exploreUrl(uid: string, opts: ExploreOpts = {}): string {
  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid },
    labelSelector: opts.labelSelector ?? '{}',
    queryType: opts.queryType ?? 'both',
    groupBy: [],
    spanSelector: [],
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
        // The Monaco-based label selector is always rendered immediately (no async load).
        // It is a more stable smoke anchor than the profile-type cascader, which only
        // renders after the async profileTypes fetch completes.
        await expect(page.getByRole('textbox', { name: /Editor content/ })).toBeVisible({ timeout: 30_000 });
      }
    );

    test('should render the profile type cascader', async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      // The cascader only renders after the async profileTypes fetch; use a generous
      // timeout to handle slow CI starts.
      const cascader = getProfileTypeCascader(page);
      await expect(cascader).toBeVisible({ timeout: 15_000 });
      // The plugin auto-selects a default profile type once profileTypes load
      // (preferring process_cpu when available, as Pyroscope self-profiles in CPU).
      // The placeholder span disappears when a value is selected (rc-cascader v2 and v3).
      await expect(cascader).not.toContainText('Select profile type');
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

      // Span ID is the most distinctively-named field; the placeholder text is part of the accessible name.
      await expect(page.getByRole('textbox', { name: '64f170a95f537095' })).toBeVisible();
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

  const CPU_PROFILE = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds';

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

    let body: { name?: string; id?: string }[] | null = null;
    const responsePromise = page.waitForResponse(async (r) => {
      if (!r.url().includes(`/resources/profileTypes`) || !r.ok()) {
        return false;
      }
      const b = await r.json().catch(() => null);
      if (!Array.isArray(b)) {
        return false;
      }
      body = b;
      return true;
    });

    await page.goto(exploreUrl(ds.uid));
    await responsePromise;

    expect((body ?? []).length).toBeGreaterThan(0);
    // Pyroscope ships with a fixed set of standard profile types; CPU is one of them.
    expect((body ?? []).some((p) => p.id?.startsWith('process_cpu'))).toBe(true);
  });
});
