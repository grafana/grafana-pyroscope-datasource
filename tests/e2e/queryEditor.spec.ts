import { test, expect } from '@grafana/plugin-e2e';

const PLUGIN_TYPE = 'grafana-pyroscope-datasource';

function exploreUrl(uid: string, opts?: { profileTypeId?: string; labelSelector?: string; queryType?: string }): string {
  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid },
    labelSelector: opts?.labelSelector ?? '{}',
    queryType: opts?.queryType ?? 'both',
  };
  if (opts?.profileTypeId) {
    query.profileTypeId = opts.profileTypeId;
  }
  const panes = JSON.stringify({
    explore: {
      datasource: uid,
      queries: [query],
      range: { from: 'now-1h', to: 'now' },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

test.describe('Query editor', () => {
  test(
    'smoke: should render query editor',
    { tag: '@plugins' },
    async ({ page, readProvisionedDataSource }) => {
      const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
      await page.goto(exploreUrl(ds.uid));
      await expect(page.getByRole('button', { name: 'Select a profile type' })).toBeVisible();
    }
  );

  test('should render label selector editor', async ({ page, readProvisionedDataSource }) => {
    const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    await page.goto(exploreUrl(ds.uid));
    await expect(page.getByRole('textbox', { name: /Editor content/ })).toBeVisible();
  });

  test('should render Options section', async ({ page, readProvisionedDataSource }) => {
    const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
    await page.goto(exploreUrl(ds.uid));
    await expect(page.getByRole('button', { name: /Options/ })).toBeVisible();
  });
});
