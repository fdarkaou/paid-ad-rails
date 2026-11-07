// Paid-ad rails digest from PeekPanda's stored paid-ad observations.
//   GET /v1/paid-ads/rails  (MCP get_ads, action rails)
// Pure functions, shared by cli.js, the tests and index.html. No dependencies.
// These figures describe ads PeekPanda collected. They are not spend, reach or performance.

const isRails = (x) => x && typeof x === 'object' && Array.isArray(x.rails) && x.totals && typeof x.totals === 'object';
const isReport = (x) => x && x.tool === 'paid-ad-rails' && Array.isArray(x.rails);

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const arr = (a) => (Array.isArray(a) ? a : []);
const str = (s) => (typeof s === 'string' ? s : s == null ? null : String(s));

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const days = (n) => (n == null ? '—' : `${n}d`);
const dayOf = (s) => (s ? String(s).slice(0, 10) : '—');
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

const FEATURE_ORDER = ['launched-this-week', 'still-live-after-90-days'];

export function truncate(s, n = 80) {
  if (s == null || s === '') return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1)).trimEnd()}…`;
}

// Run length in whole days from startedAt to endedAt (or asOf when still live / no end).
export function runDays(startedAt, endedAt = null, asOf = null) {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const endRaw = endedAt ? Date.parse(endedAt) : Date.parse(asOf || new Date().toISOString());
  if (!Number.isFinite(endRaw) || endRaw < start) return null;
  return Math.floor((endRaw - start) / 86_400_000);
}

function standing(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    advertiserExternalId: a.advertiserExternalId ?? null,
    name: a.name ?? null,
    productExternalId: a.productExternalId ?? null,
    productIconUrl: a.productIconUrl ?? null,
    category: a.category ?? null,
    liveAds: num(a.liveAds),
    totalAds: num(a.totalAds),
    newLast7Days: num(a.newLast7Days),
    liveBeyond30Days: num(a.liveBeyond30Days),
    weeklyNewAds: arr(a.weeklyNewAds).map((x) => num(x) ?? 0),
    medianRunDays: num(a.medianRunDays),
    longestRunDays: num(a.longestRunDays),
    formatMix: a.formatMix && typeof a.formatMix === 'object' ? {
      video: num(a.formatMix.video) ?? 0,
      image: num(a.formatMix.image) ?? 0,
      carousel: num(a.formatMix.carousel) ?? 0,
      dynamic: num(a.formatMix.dynamic) ?? 0,
      unknown: num(a.formatMix.unknown) ?? 0,
    } : null,
    topCta: a.topCta ?? null,
    topDestinationKind: a.topDestinationKind ?? null,
    storeRating: num(a.storeRating),
    storeRatingCount: num(a.storeRatingCount),
  };
}

function creativeItem(it, asOf) {
  const c = it.creative && typeof it.creative === 'object' ? it.creative : {};
  const startedAt = it.startedAt ?? null;
  const endedAt = it.endedAt ?? null;
  return {
    id: it.id ?? null,
    canonicalKey: it.canonicalKey ?? null,
    source: it.source ?? null,
    platform: it.platform ?? null,
    archiveId: it.archiveId ?? null,
    advertiser: it.advertiser && typeof it.advertiser === 'object'
      ? { externalId: it.advertiser.externalId ?? null, name: it.advertiser.name ?? null }
      : null,
    status: it.status ?? null,
    startedAt,
    endedAt,
    discoveredAt: it.discoveredAt ?? null,
    sourceUrl: it.sourceUrl ?? null,
    format: c.format ?? null,
    hook: truncate(c.hook, 120),
    hookFull: c.hook ?? null,
    body: c.body ?? null,
    title: c.title ?? null,
    description: c.description ?? null,
    ctaText: c.ctaText ?? null,
    imageUrls: arr(c.imageUrls),
    videoUrls: arr(c.videoUrls),
    productLink: it.productLink ?? null,
    destination: it.destination ?? null,
    productIconUrl: it.productIconUrl ?? null,
    performance: it.performance && typeof it.performance === 'object' ? { kind: it.performance.kind ?? null } : null,
    saved: it.saved === true,
    // Derived here from startedAt / endedAt (or today when still live).
    runDays: runDays(startedAt, endedAt, asOf),
  };
}

function railOf(r, asOf) {
  const kind = r.kind === 'feature' || r.kind === 'advertiser' ? r.kind : null;
  const items = arr(r.items).map((it) => creativeItem(it, asOf));
  return {
    kind,
    key: r.key ?? null,
    title: r.title ?? null,
    subtitle: r.subtitle ?? null,
    advertiser: standing(r.advertiser),
    items,
    totalItems: num(r.totalItems) ?? items.length,
  };
}

function sortRails(rails) {
  return [...rails].sort((a, b) => {
    const af = a.kind === 'feature' ? 0 : 1;
    const bf = b.kind === 'feature' ? 0 : 1;
    if (af !== bf) return af - bf;
    if (a.kind === 'feature' && b.kind === 'feature') {
      const ai = FEATURE_ORDER.indexOf(a.key);
      const bi = FEATURE_ORDER.indexOf(b.key);
      const ao = ai < 0 ? 99 : ai;
      const bo = bi < 0 ? 99 : bi;
      if (ao !== bo) return ao - bo;
    }
    return String(a.title || a.key || '').localeCompare(String(b.title || b.key || ''));
  });
}

function highlights(rails) {
  const advRails = rails.filter((r) => r.kind === 'advertiser' && r.advertiser);
  const byLive = [...advRails].sort((a, b) => (b.advertiser.liveAds ?? -1) - (a.advertiser.liveAds ?? -1)).slice(0, 3)
    .map((r) => ({ name: r.advertiser.name ?? r.title, liveAds: r.advertiser.liveAds, key: r.key }));
  const byMedian = [...advRails].filter((r) => r.advertiser.medianRunDays != null)
    .sort((a, b) => (b.advertiser.medianRunDays ?? -1) - (a.advertiser.medianRunDays ?? -1)).slice(0, 3)
    .map((r) => ({ name: r.advertiser.name ?? r.title, medianRunDays: r.advertiser.medianRunDays, key: r.key }));
  const byNew = [...advRails].filter((r) => (r.advertiser.newLast7Days ?? 0) > 0)
    .sort((a, b) => (b.advertiser.newLast7Days ?? -1) - (a.advertiser.newLast7Days ?? -1)).slice(0, 3)
    .map((r) => ({ name: r.advertiser.name ?? r.title, newLast7Days: r.advertiser.newLast7Days, key: r.key }));
  const byShelf = [...rails].filter((r) => r.totalItems != null)
    .sort((a, b) => (b.totalItems ?? -1) - (a.totalItems ?? -1)).slice(0, 3)
    .map((r) => ({ title: r.title ?? r.key, totalItems: r.totalItems, kind: r.kind, key: r.key }));
  return { busiestByLive: byLive, longestMedian: byMedian, mostNew7d: byNew, biggestShelves: byShelf };
}

function totalsOf(t) {
  return {
    ads: num(t.ads),
    liveAds: num(t.liveAds),
    advertisers: num(t.advertisers),
    liveAdvertisers: num(t.liveAdvertisers),
    newAdsLast7Days: num(t.newAdsLast7Days),
    advertisersShippingLast7Days: num(t.advertisersShippingLast7Days),
    stoppedLast7Days: num(t.stoppedLast7Days),
    halfLifeDays: num(t.halfLifeDays),
    stillRunningAt30Days: num(t.stillRunningAt30Days),
    medianRunDays: num(t.medianRunDays),
    longestRunDays: num(t.longestRunDays),
    liveBeyond60Days: num(t.liveBeyond60Days),
    reachDisclosedAds: num(t.reachDisclosedAds),
    unlinkedAds: num(t.unlinkedAds),
    uncategorizedLiveAds: num(t.uncategorizedLiveAds),
  };
}

// Input: one GET /v1/paid-ads/rails response, or a report this tool saved.
export function toReport(input, { filters = {}, fetchedAt = null, asOf = null } = {}) {
  if (isReport(input)) return input;
  if (!isRails(input)) throw new Error('Expected a GET /v1/paid-ads/rails response or a saved report.');
  const stamp = asOf || fetchedAt || input.generatedAt || new Date().toISOString();
  const rails = sortRails(arr(input.rails).map((r) => railOf(r, stamp)));
  return {
    tool: 'paid-ad-rails',
    fetchedAt,
    filters,
    generatedAt: input.generatedAt ?? null,
    asOf: stamp,
    totals: totalsOf(input.totals ?? {}),
    rails,
    insights: highlights(rails),
  };
}

const TOTAL_KEYS = [
  ['ads', 'ads collected'], ['liveAds', 'live ads'], ['newAdsLast7Days', 'new in 7 days'],
  ['stoppedLast7Days', 'stopped in 7 days'], ['halfLifeDays', 'half-life days'],
  ['stillRunningAt30Days', 'still running at day 30'], ['medianRunDays', 'median run days'],
  ['liveBeyond60Days', 'live beyond 60 days'], ['advertisers', 'advertisers'], ['liveAdvertisers', 'live advertisers'],
];

const STANDING_MOVE_KEYS = [
  ['liveAds', 'live'],
  ['newLast7Days', 'new 7d'],
  ['liveBeyond30Days', 'live beyond 30d'],
  ['medianRunDays', 'median run'],
];

// Compare with a report saved by an earlier run.
export function diff(rep, prev) {
  if (!prev || prev.tool !== 'paid-ad-rails') return null;
  const out = {
    totals: [],
    shelvesAdded: [],
    shelvesGone: [],
    totalItemsMoves: [],
    standingMoves: [],
    creativeChanges: [],
  };
  for (const [k, label] of TOTAL_KEYS) {
    const a = prev.totals?.[k], b = rep.totals?.[k];
    if (a != null && b != null && a !== b) out.totals.push({ key: k, label, from: a, to: b });
  }
  const oldMap = new Map(arr(prev.rails).map((r) => [r.key, r]));
  const nowKeys = new Set(rep.rails.map((r) => r.key));
  for (const r of rep.rails) {
    const o = oldMap.get(r.key);
    if (!o) {
      out.shelvesAdded.push({ key: r.key, title: r.title, kind: r.kind, totalItems: r.totalItems });
      continue;
    }
    if (o.totalItems != null && r.totalItems != null && o.totalItems !== r.totalItems) {
      out.totalItemsMoves.push({ key: r.key, title: r.title, from: o.totalItems, to: r.totalItems });
    }
    if (r.advertiser && o.advertiser) {
      const parts = [];
      for (const [k, label] of STANDING_MOVE_KEYS) {
        const a = o.advertiser[k], b = r.advertiser[k];
        if (a != null && b != null && a !== b) parts.push(`${label} ${a} → ${b}`);
      }
      if (parts.length) out.standingMoves.push({ key: r.key, name: r.advertiser.name ?? r.title, parts });
    }
    const oldIds = new Set(arr(o.items).map((it) => it.id).filter(Boolean));
    const nowIds = new Set(arr(r.items).map((it) => it.id).filter(Boolean));
    const added = arr(r.items).filter((it) => it.id && !oldIds.has(it.id)).map((it) => it.id);
    const gone = arr(o.items).filter((it) => it.id && !nowIds.has(it.id)).map((it) => it.id);
    if (added.length || gone.length) out.creativeChanges.push({ key: r.key, title: r.title, added, gone });
  }
  for (const r of prev.rails) {
    if (!nowKeys.has(r.key)) out.shelvesGone.push({ key: r.key, title: r.title, kind: r.kind, totalItems: r.totalItems });
  }
  return out;
}

export function diffIsEmpty(d) {
  return Object.values(d).every((v) => Array.isArray(v) && v.length === 0);
}

const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|');

function formatMixText(m) {
  if (!m) return '—';
  const parts = [];
  for (const k of ['video', 'image', 'carousel', 'dynamic', 'unknown']) {
    if ((m[k] ?? 0) > 0) parts.push(`${k} ${m[k]}`);
  }
  return parts.join(', ') || '—';
}

function diffLines(d) {
  const L = [];
  if (d.totals?.length) {
    L.push(`Totals: ${d.totals.map((x) => `${x.label} ${x.key === 'stillRunningAt30Days' ? `${pct(x.from)} → ${pct(x.to)}` : `${fmt(x.from)} → ${fmt(x.to)}`}`).join('; ')}`);
  }
  if (d.shelvesAdded?.length) L.push(`🆕 Shelves: ${d.shelvesAdded.map((s) => s.title || s.key).join(', ')}`);
  if (d.shelvesGone?.length) L.push(`Shelves gone: ${d.shelvesGone.map((s) => s.title || s.key).join(', ')}`);
  if (d.totalItemsMoves?.length) {
    L.push(`Shelf sizes: ${d.totalItemsMoves.slice(0, 8).map((m) => `${m.title || m.key} ${fmt(m.from)} → ${fmt(m.to)}`).join('; ')}`);
  }
  if (d.standingMoves?.length) {
    L.push(`Advertiser standing: ${d.standingMoves.slice(0, 8).map((m) => `${m.name} ${m.parts.join(', ')}`).join('; ')}`);
  }
  if (d.creativeChanges?.length) {
    L.push(`Creatives on shelves: ${d.creativeChanges.slice(0, 6).map((c) => {
      const bits = [];
      if (c.added.length) bits.push(`+${c.added.length}`);
      if (c.gone.length) bits.push(`−${c.gone.length}`);
      return `${c.title || c.key} ${bits.join('/')}`;
    }).join('; ')}`);
  }
  return L;
}

function itemLine(it) {
  const name = it.advertiser?.name ?? '—';
  const bits = [
    name,
    it.format || '—',
    it.status || '—',
    `started ${dayOf(it.startedAt)}`,
    `run ${days(it.runDays)}`,
    it.ctaText ? `CTA ${it.ctaText}` : null,
    it.hook ? `"${truncate(it.hook, 60)}"` : null,
    it.archiveId ? `archive ${it.archiveId}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

export function toMarkdown(rep, d = null) {
  const L = [];
  const t = rep.totals;
  const bits = Object.entries(rep.filters || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`);
  L.push('## Paid-ad rails');
  L.push('');
  if (bits.length) L.push(`Filters: ${bits.join(', ')}.`);
  L.push(`Read at ${rep.generatedAt ?? 'an unknown time'}. ${fmt(t.ads)} ads collected from ${fmt(t.advertisers)} advertiser${t.advertisers === 1 ? '' : 's'}; ${fmt(t.liveAds)} live now (${fmt(t.liveAdvertisers)} advertiser${t.liveAdvertisers === 1 ? '' : 's'} live).`);
  L.push(`Of the ads collected, ${pct(t.stillRunningAt30Days)} were still running 30 days after launch; half had stopped by day ${t.halfLifeDays ?? '— (more than half still run at day 90)'}. Median run ${days(t.medianRunDays)}, longest ${days(t.longestRunDays)}, ${fmt(t.liveBeyond60Days)} live beyond 60 days.`);
  L.push(`Last 7 days: ${fmt(t.newAdsLast7Days)} new from ${fmt(t.advertisersShippingLast7Days)} advertiser${t.advertisersShippingLast7Days === 1 ? '' : 's'}, ${fmt(t.stoppedLast7Days)} stopped.`);
  L.push(`Shelves returned: ${rep.rails.length} (${rep.rails.filter((r) => r.kind === 'feature').length} feature, ${rep.rails.filter((r) => r.kind === 'advertiser').length} advertiser).`);
  L.push('');
  L.push('### Highlights');
  const ins = rep.insights;
  if (ins.busiestByLive.length) L.push(`- Busiest by live ads: ${ins.busiestByLive.map((a) => `${a.name} (${fmt(a.liveAds)})`).join(', ')}.`);
  if (ins.longestMedian.length) L.push(`- Longest median run: ${ins.longestMedian.map((a) => `${a.name} (${days(a.medianRunDays)})`).join(', ')}.`);
  if (ins.mostNew7d.length) L.push(`- Most new in 7 days: ${ins.mostNew7d.map((a) => `${a.name} (${fmt(a.newLast7Days)})`).join(', ')}.`);
  if (ins.biggestShelves.length) L.push(`- Biggest shelves by totalItems: ${ins.biggestShelves.map((s) => `${s.title} (${fmt(s.totalItems)}, ${s.kind})`).join(', ')}.`);
  if (!ins.busiestByLive.length && !ins.biggestShelves.length) L.push('- No shelves to highlight.');
  if (d) {
    L.push('');
    L.push('### Since last run');
    const dl = diffLines(d);
    if (dl.length) L.push(...dl.map((x) => `- ${x}`));
    else L.push('Nothing changed since the last run.');
  }
  for (const r of rep.rails) {
    L.push('');
    if (r.kind === 'feature') {
      L.push(`### Feature · ${r.title || r.key}`);
      if (r.subtitle) L.push(r.subtitle);
      L.push(`${fmt(r.items.length)} on this shelf · ${fmt(r.totalItems)} in all.`);
    } else {
      L.push(`### Advertiser · ${r.title || r.advertiser?.name || r.key}`);
      if (r.subtitle) L.push(r.subtitle);
      const a = r.advertiser;
      if (a) {
        L.push(`Standing: live ${fmt(a.liveAds)} / total ${fmt(a.totalAds)}, new 7d ${fmt(a.newLast7Days)}, live beyond 30d ${fmt(a.liveBeyond30Days)}, median ${days(a.medianRunDays)}, longest ${days(a.longestRunDays)}.`);
        L.push(`Format mix: ${formatMixText(a.formatMix)}. Top CTA: ${a.topCta ?? '—'}. Destination: ${a.topDestinationKind ?? '—'}.${a.category ? ` Category: ${a.category}.` : ''}`);
      }
      L.push(`${fmt(r.items.length)} on this shelf · ${fmt(r.totalItems)} in all.`);
    }
    if (!r.items.length) {
      L.push('_No creatives on this shelf in the response._');
      continue;
    }
    L.push('| Advertiser | Format | Status | Started | Run | CTA | Hook | Archive |');
    L.push('| --- | --- | --- | --- | ---: | --- | --- | --- |');
    for (const it of r.items) {
      L.push(`| ${cell(it.advertiser?.name)} | ${cell(it.format)} | ${cell(it.status)} | ${dayOf(it.startedAt)} | ${days(it.runDays)} | ${cell(it.ctaText)} | ${cell(truncate(it.hook, 50))} | ${cell(it.archiveId)} |`);
    }
  }
  L.push('');
  L.push(`Ads that belong to no app: ${fmt(t.unlinkedAds)}. Live ads with no category: ${fmt(t.uncategorizedLiveAds)}. Ads with disclosed reach: ${fmt(t.reachDisclosedAds)}.`);
  L.push('These figures describe the ads PeekPanda collected from Meta and TikTok ad libraries. They are not spend, reach or performance, and a longer run does not prove an ad works.');
  return L.join('\n');
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCsv(rep) {
  const head = [
    'rail_key', 'rail_kind', 'rail_title', 'rail_total_items',
    'standing_live_ads', 'standing_total_ads', 'standing_new_7d', 'standing_live_beyond_30',
    'standing_median_run', 'standing_longest_run', 'standing_top_cta',
    'creative_id', 'archive_id', 'platform', 'advertiser_name', 'advertiser_external_id',
    'status', 'started_at', 'ended_at', 'run_days', 'format', 'cta', 'hook', 'source_url',
  ];
  const rows = [];
  for (const r of rep.rails) {
    const a = r.advertiser;
    if (!r.items.length) {
      rows.push([
        r.key, r.kind, r.title, r.totalItems,
        a?.liveAds, a?.totalAds, a?.newLast7Days, a?.liveBeyond30Days,
        a?.medianRunDays, a?.longestRunDays, a?.topCta,
        '', '', '', '', '', '', '', '', '', '', '', '', '',
      ]);
      continue;
    }
    for (const it of r.items) {
      rows.push([
        r.key, r.kind, r.title, r.totalItems,
        a?.liveAds, a?.totalAds, a?.newLast7Days, a?.liveBeyond30Days,
        a?.medianRunDays, a?.longestRunDays, a?.topCta,
        it.id, it.archiveId, it.platform, it.advertiser?.name, it.advertiser?.externalId,
        it.status, it.startedAt, it.endedAt, it.runDays, it.format, it.ctaText, it.hook, it.sourceUrl,
      ]);
    }
  }
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function toChat(rep, d = null) {
  const L = [];
  const t = rep.totals;
  L.push(`Paid-ad rails: ${fmt(t.ads)} ads, ${fmt(t.liveAds)} live, ${rep.rails.length} shelves, half-life ${t.halfLifeDays ?? '—'}d`);
  L.push(`Last 7 days: ${fmt(t.newAdsLast7Days)} new, ${fmt(t.stoppedLast7Days)} stopped`);
  const top = rep.insights.busiestByLive.slice(0, 2).map((a) => `${a.name} (${a.liveAds} live)`).join(', ');
  if (top) L.push(`Busiest: ${top}`);
  if (d) for (const x of diffLines(d).slice(0, 3)) L.push(x);
  return L.join('\n');
}

// Exported for tests / browser helpers.
export { itemLine, formatMixText, FEATURE_ORDER };
