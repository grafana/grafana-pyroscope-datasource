import { test, expect } from '@grafana/plugin-e2e';
import { type Locator, type Page } from '@playwright/test';

import { type PyroscopeDataSourceOptions } from '../../src/types';

// Local URL Pyroscope is reachable on from the host machine.
// Inside the Grafana container, Pyroscope is at http://pyroscope:4040 (set in provisioning).
const LOCAL_PYROSCOPE_URL = 'http://localhost:4040';

// Grafana 13 migrated the data source connection URL input from aria-label to data-testid
// (https://github.com/grafana/grafana/pull/121784). This helper matches both
// shapes so tests work across versions.
function getDataSourceConnectionUrlInput(page: Page): Locator {
  return page.locator(
    '[data-testid="data-testid Data source connection URL"], [aria-label="Data source connection URL"]'
  );
}

// Cloud env vars (set by the Bench environment in scheduled Cloud runs).
// When DS_INSTANCE_HOST is set, the URL is built from it; otherwise tests target
// the locally-provisioned Pyroscope container.
const dsHost = process.env.DS_INSTANCE_HOST;
const dsUser = process.env.DS_INSTANCE_USERNAME;
const dsPassword = process.env.DS_INSTANCE_PASSWORD;
const cloudUrl = dsHost ? `https://${dsHost}` : undefined;

test.describe('Config editor', () => {
  test.describe('rendering', () => {
    test(
      'smoke: should render config editor',
      { tag: '@plugins' },
      async ({ createDataSourceConfigPage, readProvisionedDataSource, page }) => {
        const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
        await createDataSourceConfigPage({ type: ds.type });
        await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
      }
    );

    test('should render Connection section with URL field', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await createDataSourceConfigPage({ type: ds.type });
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
      await expect(getDataSourceConnectionUrlInput(page)).toBeVisible();
    });

    test('should render Authentication section', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await createDataSourceConfigPage({ type: ds.type });
      await expect(page.getByRole('heading', { name: 'Authentication', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Authentication methods' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'TLS settings' })).toBeVisible();
    });

    test('should render Additional settings section (collapsed by default)', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await createDataSourceConfigPage({ type: ds.type });
      const heading = page.getByRole('heading', { name: 'Additional settings' });
      await expect(heading).toBeVisible();
      // Initially collapsed - "Expand section" button is present.
      await expect(page.getByRole('button', { name: 'Expand section Additional settings' })).toBeVisible();
    });

    test('should reveal Minimal step field when Additional settings is expanded', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await createDataSourceConfigPage({ type: ds.type });
      await page.getByRole('button', { name: 'Expand section Additional settings' }).click();
      // The Minimal step textbox is labelled with both its label and description, so use a partial match.
      await expect(page.getByRole('textbox', { name: /Minimal step/ })).toBeVisible();
    });
  });

  test.describe('provisioned datasource', () => {
    test('should load provisioned config page', async ({
      gotoDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await gotoDataSourceConfigPage(ds.uid);
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
    });

    test('should load provisioned URL value', async ({
      gotoDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await gotoDataSourceConfigPage(ds.uid);
      // The provisioned URL is http://pyroscope:4040 (the Docker service name).
      await expect(getDataSourceConnectionUrlInput(page)).toHaveValue(/https?:\/\/.+/);
    });
  });

  test.describe('save & test', () => {
    test('should pass health check for the provisioned datasource', async ({
      gotoDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      await gotoDataSourceConfigPage(ds.uid);
      // Provisioned datasources don't expose Save & test; clicking "Test" is enough.
      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(page.getByText('Data source is working')).toBeVisible();
    });

    test('should pass health check when configuring a fresh datasource against the live backend', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      const configPage = await createDataSourceConfigPage({ type: ds.type });
      // Use the cloud URL if provided, else the locally provisioned Pyroscope.
      // Note: createDataSourceConfigPage runs the request from inside the Grafana container,
      // so we use the docker service hostname (pyroscope:4040) when no cloud host is set.
      const url = cloudUrl ?? 'http://pyroscope:4040';
      await getDataSourceConnectionUrlInput(page).fill(url);

      if (cloudUrl && dsUser && dsPassword) {
        // Cloud Pyroscope requires basic auth (stack id / API token).
        await page.getByRole('combobox', { name: 'Authentication method' }).click();
        await page.getByRole('option', { name: 'Basic authentication' }).click();
        await page.getByLabel('User *', { exact: true }).fill(dsUser);
        await page.getByLabel('Password *', { exact: true }).fill(dsPassword);
      }

      await expect(configPage.saveAndTest()).toBeOK();
      await expect(configPage).toHaveAlert('success');
    });

    test('should show error alert when health check fails', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      const configPage = await createDataSourceConfigPage({ type: ds.type });
      await page.route('**/api/datasources/uid/*/health', (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'connection refused' }),
        })
      );
      await getDataSourceConnectionUrlInput(page).fill(LOCAL_PYROSCOPE_URL);
      await expect(configPage.saveAndTest()).not.toBeOK();
      await expect(configPage).toHaveAlert('error');
    });

    test('should show error alert when backend is unreachable', async ({
      createDataSourceConfigPage,
      readProvisionedDataSource,
      page,
    }) => {
      const ds = await readProvisionedDataSource<PyroscopeDataSourceOptions>({ fileName: 'datasources.yml' });
      const configPage = await createDataSourceConfigPage({ type: ds.type });
      // Point at a host that will reliably refuse the connection.
      await getDataSourceConnectionUrlInput(page).fill('http://127.0.0.1:65534');
      await expect(configPage.saveAndTest()).not.toBeOK();
      await expect(configPage).toHaveAlert('error');
    });
  });
});
