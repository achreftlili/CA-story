import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildIndex } from '../../src/dashboard.js';
import { renderDashboardHtml } from '../../src/render/dashboard-html.js';
import { renderTimelineBody } from '../../src/render/session-html.js';
import { parseSession } from '../../src/parse.js';
import { extractEvents } from '../../src/extract.js';
import { buildTimeline } from '../../src/timeline.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // Playwright not installed — this whole suite is skipped.
}

test('e2e: dashboard loads, has no console errors, filters work', { skip: !chromium }, async () => {
  if (!chromium) return;
  const root = await mkdtemp(path.join(tmpdir(), 'prstory-e2e-'));
  const projectDir = path.join(root, '-repo-foo');
  await cp(FIX, projectDir, { recursive: true });

  const index = await buildIndex({ projectsRoot: root });
  const fragments = {};
  for (const s of index.sessions) {
    const { events } = await parseSession(s.__sourcePath);
    const evs = extractEvents({ events });
    const timeline = buildTimeline(evs, { sessionId: s.id });
    fragments[s.id] = renderTimelineBody(timeline);
  }
  const html = renderDashboardHtml(index, { fragments });
  const htmlPath = path.join(root, 'dashboard.html');
  await writeFile(htmlPath, html, 'utf8');

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

  // Block any outbound network requests — there should be none.
  let networkAttempts = 0;
  await page.route('http://**', (route) => { networkAttempts++; route.abort(); });
  await page.route('https://**', (route) => { networkAttempts++; route.abort(); });

  await page.goto(pathToFileURL(htmlPath).toString());
  await page.waitForSelector('#prstory-list .session-row');

  const baselineCount = await page.locator('#prstory-list .session-row').count();
  assert.ok(baselineCount >= 4, `baseline session count too low: ${baselineCount}`);

  await page.fill('#prstory-search', 'healthcheck');
  // Allow debounce to fire.
  await page.waitForTimeout(150);
  const filtered = await page.locator('#prstory-list .session-row').count();
  assert.ok(filtered <= baselineCount, 'filtering should not increase row count');
  assert.ok(filtered >= 1, 'filtering should keep matching rows');

  await page.fill('#prstory-search', '');
  await page.waitForTimeout(150);

  // Click a row to expand inline detail. Wait for the .session-detail to
  // get its data-loaded flag flipped before reading content.
  const firstRow = page.locator('#prstory-list .session-row').first();
  await firstRow.locator('summary').click();
  await page.waitForFunction(
    () => {
      const row = document.querySelector('#prstory-list .session-row');
      const pane = row && row.querySelector('.session-detail');
      return pane && pane.dataset.loaded === '1';
    },
    null,
    { timeout: 5000 },
  );
  const detailText = await firstRow.locator('.session-detail').textContent();
  assert.ok((detailText || '').length > 0, 'session detail should populate on expand');

  assert.equal(networkAttempts, 0, `expected 0 network requests, saw ${networkAttempts}`);
  assert.deepEqual(errors, [], 'no console errors');

  await browser.close();
  await rm(root, { recursive: true, force: true });
});
