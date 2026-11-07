import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toReport, diff, diffIsEmpty, toCsv, toMarkdown, toChat, runDays, truncate } from '../rails.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8'));
const rails = load('rails.json');
const prev = load('previous.json');

test('reads a rails response or a saved report', () => {
  const r = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  assert.equal(r.tool, 'paid-ad-rails');
  assert.equal(r.rails.length, 6);
  assert.equal(r.rails.filter((x) => x.kind === 'feature').length, 2);
  assert.equal(r.rails.filter((x) => x.kind === 'advertiser').length, 4);
  assert.equal(toReport(r), r);
  assert.throws(() => toReport({ hello: 1 }), /Expected a GET/);
});

test('feature shelves come first in documented key order', () => {
  const r = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  assert.equal(r.rails[0].key, 'launched-this-week');
  assert.equal(r.rails[1].key, 'still-live-after-90-days');
  assert.equal(r.rails[0].kind, 'feature');
  assert.equal(r.rails[2].kind, 'advertiser');
});

test('run days from startedAt/endedAt or asOf; truncate hooks', () => {
  assert.equal(runDays('2026-06-01T00:00:00.000Z', '2026-06-21T00:00:00.000Z'), 20);
  assert.equal(runDays('2026-11-01T00:00:00.000Z', null, '2026-11-02T00:00:00.000Z'), 1);
  assert.equal(runDays(null), null);
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 10), 'abc');
  const r = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  const inactive = r.rails.find((x) => x.key === 'advertiser:example-fit').items.find((i) => i.status === 'inactive');
  assert.equal(inactive.runDays, 20);
  const long = r.rails.find((x) => x.key === 'still-live-after-90-days').items[0];
  assert.ok(long.runDays >= 90);
  assert.ok(long.hook.length <= 120);
});

test('highlights pick busiest / longest median / most new / biggest shelves', () => {
  const r = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  assert.equal(r.insights.busiestByLive[0].name, 'Example Fitness');
  assert.equal(r.insights.busiestByLive[0].liveAds, 42);
  assert.equal(r.insights.longestMedian[0].name, 'Example Focus');
  assert.equal(r.insights.longestMedian[0].medianRunDays, 28);
  assert.equal(r.insights.mostNew7d[0].name, 'Example Fitness');
  assert.equal(r.insights.biggestShelves[0].key, 'still-live-after-90-days');
  assert.equal(r.insights.biggestShelves[0].totalItems, 88);
});

test('advertiser standing and honest totalItems on shelves', () => {
  const r = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  const fit = r.rails.find((x) => x.key === 'advertiser:example-fit');
  assert.equal(fit.advertiser.liveAds, 42);
  assert.equal(fit.advertiser.topCta, 'Download');
  assert.equal(fit.advertiser.formatMix.video, 60);
  assert.equal(fit.items.length, 3);
  assert.equal(fit.totalItems, 42); // shelf shows 3, totalItems says 42 in all
  const launched = r.rails.find((x) => x.key === 'launched-this-week');
  assert.equal(launched.advertiser, null);
  assert.equal(launched.totalItems, 49);
});

test('diff shelves, totalItems, standing and creatives', () => {
  const cur = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  const old = toReport(prev, { asOf: '2026-10-26T09:00:00.000Z' });
  const d = diff(cur, old);
  assert.ok(d.shelvesAdded.some((s) => s.key === 'advertiser:example-focus'));
  assert.ok(d.shelvesAdded.some((s) => s.key === 'advertiser:example-sleep'));
  assert.ok(d.shelvesGone.some((s) => s.key === 'advertiser:example-old'));
  assert.ok(d.totals.some((t) => t.key === 'liveAds' && t.from === 351 && t.to === 372));
  assert.ok(d.totalItemsMoves.some((m) => m.key === 'launched-this-week' && m.from === 40 && m.to === 49));
  assert.ok(d.standingMoves.some((m) => m.name === 'Example Fitness' && m.parts.some((p) => p.includes('live 38 → 42'))));
  const launchedChange = d.creativeChanges.find((c) => c.key === 'launched-this-week');
  assert.ok(launchedChange.added.includes('aaaaaaaa-1111-4111-8111-111111111111'));
  assert.ok(launchedChange.gone.includes('aaaaaaaa-0000-4000-8000-000000000000'));
  assert.equal(diff(cur, null), null);
  assert.equal(diffIsEmpty(diff(cur, cur)), true);
});

test('outputs', () => {
  const r = toReport(rails, { asOf: '2026-11-02T09:00:00.000Z' });
  const d = diff(r, toReport(prev, { asOf: '2026-10-26T09:00:00.000Z' }));
  const md = toMarkdown(r, d);
  assert.match(md, /Paid-ad rails/);
  assert.match(md, /not spend, reach or performance/);
  assert.match(md, /Feature · Launched this week/);
  assert.match(md, /Advertiser · Example Fitness/);
  assert.match(md, /42 in all/);
  assert.match(md, /🆕 Shelves/);
  assert.match(md, /Shelves gone/);
  const csv = toCsv(r).split('\n');
  assert.match(csv[0], /^rail_key,rail_kind,rail_title/);
  // one row per creative on a shelf (3+3+3+2+1+1 = 13)
  assert.equal(csv.length, 14);
  assert.match(toChat(r), /Paid-ad rails: 1,260 ads/);
  assert.match(toChat(r, d), /Shelves/);
});
