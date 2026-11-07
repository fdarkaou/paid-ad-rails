#!/usr/bin/env node
// Paid-ad rails digest from PeekPanda. Node 18+, no dependencies.
//   GET /v1/paid-ads/rails  (MCP get_ads, action rails)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { toReport, toMarkdown, toCsv, toChat, diff } from './rails.js';

const HELP = `Usage:
  PEEKPANDA_TOKEN=... node cli.js [options]
  node cli.js --file response.json [options]

Options (GET /v1/paid-ads/rails):
  --platform <p>             meta|tiktok
  --category <name>          limit shelves to one category
  --search <text>            advertiser or creative text (max 120). Huge matches answer 422 invalid_request
  --sort <s>                 most_tested|longest_running|most_live|recently_tracked (default most_tested)
  --rail-size <4-20>         creatives on each shelf (default 10)
  --advertisers <1-20>       advertiser shelves to return (default 8)
Output and state:
  --state <path>             compare with the report saved at this path, then save this run there
  --archive <dir>            also save the raw API response as <dir>/rails-<YYYY-MM-DD>.json
  --format md|csv|json       output format (default md; json is this tool's report)
  --webhook <url>            also POST a short summary to a Slack or Discord incoming webhook
  --tenancy <value>          x-genviral-tenancy header (default personal)
  --api <url>                API base (default https://api.peekpanda.com)
  --file <path>              read a saved response or report instead of calling the API

Each run is one API call. The numbers describe ads PeekPanda collected. They are not spend or performance.`;

const SORTS = new Set(['most_tested', 'longest_running', 'most_live', 'recently_tracked']);

function parse(argv) {
  const o = { format: 'md', tenancy: 'personal', api: 'https://api.peekpanda.com', _set: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      o[key] = argv[++i];
      o._set.add(key);
    } else throw new Error(`Unexpected argument "${a}". See --help.`);
  }
  return o;
}

function buildRequest(o) {
  const q = new URLSearchParams();
  const filters = {};
  if (o.platform) {
    if (!['meta', 'tiktok'].includes(o.platform)) throw new Error('--platform must be meta or tiktok');
    q.set('platform', o.platform); filters.platform = o.platform;
  }
  if (o.category) { q.set('category', o.category); filters.category = o.category; }
  if (o.search != null) {
    const s = String(o.search);
    if (s.length > 120) throw new Error('--search must be at most 120 characters');
    q.set('search', s); filters.search = s;
  }
  if (o.sort != null) {
    if (!SORTS.has(o.sort)) throw new Error('--sort must be most_tested, longest_running, most_live or recently_tracked');
    q.set('sort', o.sort); filters.sort = o.sort;
  }
  if (o['rail-size'] != null) {
    const n = Number(o['rail-size']);
    if (!Number.isInteger(n) || n < 4 || n > 20) throw new Error('--rail-size must be a whole number from 4 to 20');
    q.set('railSize', String(n)); filters.railSize = n;
  }
  if (o.advertisers != null) {
    const n = Number(o.advertisers);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('--advertisers must be a whole number from 1 to 20');
    q.set('advertiserLimit', String(n)); filters.advertiserLimit = n;
  }
  return { path: '/v1/paid-ads/rails', query: q, filters };
}

async function get(o, req, retried = false) {
  const token = process.env.PEEKPANDA_TOKEN;
  if (!token) throw new Error('Set PEEKPANDA_TOKEN to a PeekPanda API key (Account → API keys). Never commit it.');
  const url = new URL(req.path, o.api);
  for (const [k, v] of req.query) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-genviral-tenancy': o.tenancy, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? '';
    const retry = Number(res.headers.get('retry-after'));
    // 429 rate_limited: honor a short Retry-After once. daily_call_limit: stop until 00:00 UTC.
    // 422 invalid_request: often a search matching more than 30,000 ads — use a more specific term.
    if (res.status === 429 && code !== 'daily_call_limit' && !retried && retry > 0 && retry <= 60) {
      await new Promise((r) => setTimeout(r, retry * 1000));
      return get(o, req, true);
    }
    const err = new Error(`PeekPanda API ${res.status} ${code}: ${body?.error?.message ?? res.statusText}`);
    err.status = res.status; err.code = code;
    throw err;
  }
  return res.json();
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }
  if (!['md', 'csv', 'json'].includes(o.format)) throw new Error('--format must be md, csv or json');

  let report;
  let raw = null;
  if (o.file) {
    report = toReport(JSON.parse(await readFile(o.file, 'utf8')));
  } else {
    const req = buildRequest(o);
    raw = await get(o, req);
    report = toReport(raw, { filters: req.filters, fetchedAt: new Date().toISOString() });
  }

  let d = null;
  if (o.state) {
    const prev = await readFile(o.state, 'utf8').then(JSON.parse).catch(() => null);
    d = diff(report, prev && prev.tool === 'paid-ad-rails' ? prev : prev ? toReport(prev) : null);
    await writeFile(o.state, JSON.stringify(report, null, 2));
  }
  if (o.archive) {
    await mkdir(o.archive, { recursive: true });
    const stamp = (report.generatedAt ?? report.fetchedAt ?? new Date().toISOString()).slice(0, 10);
    const payload = raw ?? report;
    await writeFile(join(o.archive, `rails-${stamp}.json`), JSON.stringify(payload, null, 2));
  }

  if (o.format === 'json') console.log(JSON.stringify(report, null, 2));
  else if (o.format === 'csv') console.log(toCsv(report));
  else console.log(toMarkdown(report, d));

  if (o.webhook) {
    const text = toChat(report, d);
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(o.webhook);
    const r = await fetch(o.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isDiscord ? { content: text.slice(0, 1900) } : { text }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
