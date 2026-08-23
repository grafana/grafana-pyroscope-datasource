import { test, expect } from '@grafana/plugin-e2e';

import { DS_PASSWORD, DS_URL, DS_USERNAME, PLUGIN_TYPE, resolveDataSourceUid } from './env';

// Local URL Pyroscope is reachable on from the host machine.
// Inside the Grafana container, Pyroscope is at http://pyroscope:4040 (set in provisioning).
const LOCAL_PYROSCOPE_URL = 'http://localhost:4040';

test.describe('Config editor', () => {
  test.describe('rendering', () => {
    test('smoke: should render config editor', { tag: '@plugins' }, async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
    });

    test('should render Connection section with URL field', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Data source connection URL' })).toBeVisible();
    });

    test('should render Authentication section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await expect(page.getByRole('heading', { name: 'Authentication', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Authentication methods' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'TLS settings' })).toBeVisible();
    });

    test('should render Additional settings section (collapsed by default)', async ({
      createDataSourceConfigPage,
      page,
    }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      const heading = page.getByRole('heading', { name: 'Additional settings' });
      await expect(heading).toBeVisible();
      // Initially collapsed - "Expand section" button is present.
      await expect(page.getByRole('button', { name: 'Expand section Additional settings' })).toBeVisible();
    });

    test('should reveal Minimal step field when Additional settings is expanded', async ({
      createDataSourceConfigPage,
      page,
    }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await page.getByRole('button', { name: 'Expand section Additional settings' }).click();
      // The Minimal step textbox is labelled with both its label and description, so use a partial match.
      await expect(page.getByRole('textbox', { name: /Minimal step/ })).toBeVisible();
    });
  });

  test.describe('provisioned datasource', () => {
    test('should load provisioned config page', async ({ gotoDataSourceConfigPage, page }) => {
      await gotoDataSourceConfigPage(await resolveDataSourceUid(page));
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
    });

    test('should load provisioned URL value', async ({ gotoDataSourceConfigPage, page }) => {
      await gotoDataSourceConfigPage(await resolveDataSourceUid(page));
      await expect(page.getByRole('textbox', { name: 'Data source connection URL' })).toHaveValue(/https?:\/\/.+/);
    });
  });

  test.describe('save & test', () => {
    test('should pass health check for the provisioned datasource', async ({ gotoDataSourceConfigPage, page }) => {
      await gotoDataSourceConfigPage(await resolveDataSourceUid(page));
      // Provisioned datasources don't expose Save & test; clicking "Test" is enough.
      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(page.getByText('Data source is working')).toBeVisible();
    });

    test('should pass health check when configuring a fresh datasource against the live backend', async ({
      createDataSourceConfigPage,
      page,
    }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await page.getByRole('textbox', { name: 'Data source connection URL' }).fill(DS_URL);

      if (DS_USERNAME && DS_PASSWORD) {
        // Cloud Pyroscope requires basic auth (stack id / API token).
        await page.getByRole('combobox', { name: 'Authentication method' }).click();
        await page.getByRole('option', { name: 'Basic authentication' }).click();
        await page.getByLabel('User *', { exact: true }).fill(DS_USERNAME);
        await page.getByLabel('Password *', { exact: true }).fill(DS_PASSWORD);
      }

      await expect(configPage.saveAndTest()).toBeOK();
      await expect(configPage).toHaveAlert('success');
    });

    test('should show error alert when health check fails', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await page.route('**/api/datasources/uid/*/health', (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'connection refused' }),
        })
      );
      await page.getByRole('textbox', { name: 'Data source connection URL' }).fill(LOCAL_PYROSCOPE_URL);
      await expect(configPage.saveAndTest()).not.toBeOK();
      await expect(configPage).toHaveAlert('error');
    });

    test('should show error alert when backend is unreachable', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      // Point at a host that will reliably refuse the connection.
      await page.getByRole('textbox', { name: 'Data source connection URL' }).fill('http://127.0.0.1:65534');
      await expect(configPage.saveAndTest()).not.toBeOK();
      await expect(configPage).toHaveAlert('error');
    });
  });
});
