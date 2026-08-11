import { request, type FullConfig } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-pyroscope-datasource';
const PROVISIONED_DS_UID = 'pyroscope-test';
const CPU_PROFILE = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds';
const POLL_INTERVAL_MS = 1000;
// Generous budget so cold starts under resource pressure (e.g. emulated amd64
// images on arm64 hosts, or right after another container teardown) don't
// trip the warmup. Each poll is cheap (~ms), so a long ceiling is safe.
const POLL_TIMEOUT_MS = 240_000;

/**
 * One-shot backend warmup that runs before any worker spawns.
 *
 * Pyroscope self-profiles on startup, but its first `/resources/profileTypes`
 * response can come back empty and its first "both" query response can return
 * only the metrics frame (no flamegraph yet) for ~10–60s after the container
 * becomes ready. The query editor caches the empty profile-type list and
 * renders "No profile types found" until the user reloads.
 *
 * Running the wait here (instead of in a per-file `test.beforeAll`) ensures the
 * polling does not race against itself across N parallel workers, and that
 * every worker starts against a stable backend.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL || process.env.GRAFANA_URL || 'http://localhost:3000';
  const grafanaUser = process.env.GRAFANA_ADMIN_USER || 'admin';
  const grafanaPass = process.env.GRAFANA_ADMIN_PASSWORD || 'admin';

  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      Authorization: 'Basic ' + Buffer.from(`${grafanaUser}:${grafanaPass}`).toString('base64'),
    },
  });

  const start = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[global-setup] waiting for Pyroscope warmup at ${baseURL} (timeout ${POLL_TIMEOUT_MS}ms)`);

  // 1) profileTypes resource endpoint must return at least one entry.
  const profileTypesReady = await pollUntil(POLL_TIMEOUT_MS, async () => {
    const now = Date.now();
    const resp = await ctx.get(
      `/api/datasources/uid/${PROVISIONED_DS_UID}/resources/profileTypes?start=${now - 15 * 60 * 1000}&end=${now}`
    );
    if (!resp.ok()) {
      return false;
    }
    const body = await resp.json().catch(() => null);
    return Array.isArray(body) && body.length > 0;
  });
  if (!profileTypesReady) {
    await ctx.dispose();
    throw new Error(`global-setup: profileTypes did not become non-empty within ${POLL_TIMEOUT_MS}ms`);
  }

  // 2) "both" query must return both the metrics graph and the flamegraph frame.
  const bothQueryReady = await pollUntil(POLL_TIMEOUT_MS - (Date.now() - start), async () => {
    const now = Date.now();
    const resp = await ctx.post('/api/ds/query', {
      data: {
        from: String(now - 15 * 60 * 1000),
        to: String(now),
        queries: [
          {
            refId: 'A',
            datasource: { type: PLUGIN_TYPE, uid: PROVISIONED_DS_UID },
            profileTypeId: CPU_PROFILE,
            labelSelector: '{}',
            queryType: 'both',
            groupBy: [],
            spanSelector: [],
            // Must stay empty: a real trace ID would filter the probe query down to
            // nothing and it would never see the two frames it waits for.
            traceIdSelector: [],
            includeExemplars: false,
          },
        ],
      },
    });
    if (!resp.ok()) {
      return false;
    }
    const body = await resp.json().catch(() => null);
    const frames = body?.results?.A?.frames ?? [];
    return frames.length >= 2;
  });

  await ctx.dispose();

  if (!bothQueryReady) {
    throw new Error(`global-setup: "both" query did not return >= 2 frames within ${POLL_TIMEOUT_MS}ms`);
  }

  // eslint-disable-next-line no-console
  console.log(`[global-setup] Pyroscope warm in ${Date.now() - start}ms`);
}

async function pollUntil(timeoutMs: number, predicate: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return true;
      }
    } catch {
      // Network blip while Grafana/Pyroscope are warming up – retry.
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}
