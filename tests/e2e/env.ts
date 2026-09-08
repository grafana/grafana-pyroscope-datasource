/// <reference types="node" />
import { type Page } from '@playwright/test';

export const PLUGIN_TYPE = 'grafana-pyroscope-datasource';
export const isCloudRun = !!process.env.GRAFANA_URL;

function requireOnCloud(name: string, localDefault: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (isCloudRun) {
    throw new Error(
      `${name} is not set, but GRAFANA_URL is, so this Cloud run expects it from Vault. ` +
        `Check the repo-secrets paths in .github/workflows/cron.yml; they are relative to ` +
        `ci/repo/grafana/grafana-pyroscope-datasource/.`
    );
  }
  return localDefault;
}

export const DS_URL = requireOnCloud('DS_INSTANCE_URL', 'http://pyroscope:4040');
export const DS_USERNAME = process.env.DS_INSTANCE_USERNAME?.trim() ?? '';
export const DS_PASSWORD = process.env.DS_INSTANCE_PASSWORD?.trim() ?? '';

const LOCAL_DS_UID = 'pyroscope-test';

export async function resolveDataSourceUid(page: Page): Promise<string> {
  if (!isCloudRun) {
    return LOCAL_DS_UID;
  }

  const response = await page.request.get('/api/datasources');
  if (!response.ok()) {
    throw new Error(`Could not list data sources on ${process.env.GRAFANA_URL}: HTTP ${response.status()}`);
  }

  const candidates: Array<{ name: string; uid: string; url: string }> = (await response.json()).filter(
    (dataSource: { type: string }) => dataSource.type === PLUGIN_TYPE
  );
  const expectedOrigin = new URL(DS_URL).origin;
  const exactMatch = candidates.find((dataSource) => {
    try {
      return new URL(dataSource.url).origin === expectedOrigin;
    } catch {
      return false;
    }
  });
  if (exactMatch) {
    return exactMatch.uid;
  }

  if (candidates.length === 1) {
    console.warn(
      `DS_INSTANCE_HOST does not match the configured Pyroscope data source; using the only candidate ` +
        `("${candidates[0].name}"). Update Vault if its connection URL changed.`
    );
    return candidates[0].uid;
  }

  throw new Error(
    `Could not resolve the Cloud Pyroscope data source. Found ${candidates.length} candidate(s): ` +
      `${JSON.stringify(candidates.map((dataSource) => dataSource.name))}.`
  );
}
