# paid-ad-rails

Browse PeekPanda's paid-ad shelves as a short digest. One call to `GET /v1/paid-ads/rails` becomes: totals for the stored library, feature shelves (launched this week, still live after 90 days), per-advertiser shelves with standing stats and the creatives on each shelf, highlights (busiest advertisers, longest median, most new in 7 days, biggest shelves), and what changed since last run.

Output is Markdown, CSV or JSON, and it can post a short summary to Slack or Discord. Node 18+, no dependencies. There is also a [browser version](https://fdarkaou.github.io/paid-ad-rails/) that reads pasted JSON, lays out the shelves as cards and never sends anything anywhere.

```
## Paid-ad rails

Read at 2026-11-02T09:00:00.000Z. 1,260 ads collected from 12 advertisers; 372 live now (9 advertisers live).
Of the ads collected, 32% were still running 30 days after launch; half had stopped by day 17. Median run 9d, longest 188d, 41 live beyond 60 days.
Last 7 days: 49 new from 4 advertisers, 31 stopped.
Shelves returned: 6 (2 feature, 4 advertiser).

### Highlights
- Busiest by live ads: Example Fitness (42), Example Meal Planner (28), Example Focus (19).
- Longest median run: Example Focus (28d), Example Fitness (14d), Example Meal Planner (11d).
```

(Example data from `examples/`, not real advertisers or apps.)

## Where the data comes from

The data comes from [PeekPanda](https://peekpanda.com), an iOS competitor catalogue that stores dated paid-ad observations from the Meta and TikTok ad libraries. The tool calls:

- [`GET /v1/paid-ads/rails`](https://peekpanda.com/docs/paid-ad-rails) (MCP tool `get_ads`, action `rails`, scope `context:read`). Optional filters: `platform` (meta or tiktok), `category`, `search` (max 120), `sort` (`most_tested` | `longest_running` | `most_live` | `recently_tracked`, default `most_tested`), `railSize` (4-20, default 10), `advertiserLimit` (1-20, default 8).

It does not start collection. It reads stored rows; see also the [paid ads library](https://peekpanda.com/docs/paid-ads-library) guide and [search paid ads](https://peekpanda.com/docs/search-paid-ads) for the creative item shape.

Fields read: top-level `generatedAt`, `rails[]`, `totals` (same ranking totals as the intelligence read: ads, liveAds, advertisers, liveAdvertisers, newAdsLast7Days, advertisersShippingLast7Days, stoppedLast7Days, halfLifeDays, stillRunningAt30Days, medianRunDays, longestRunDays, liveBeyond60Days, reachDisclosedAds, unlinkedAds, uncategorizedLiveAds). Each rail has `kind` (`feature` or `advertiser`), `key`, `title`, `subtitle`, nullable `advertiser` standing, `items[]` and `totalItems`. Feature keys in the product contract: `launched-this-week`, `still-live-after-90-days`. Advertiser standing: liveAds, totalAds, newLast7Days, liveBeyond30Days, weeklyNewAds, medianRunDays, longestRunDays, formatMix, topCta, topDestinationKind, storeRating, storeRatingCount. Each item uses the Search paid ads shape (id, archiveId, platform, advertiser, status, startedAt, endedAt, sourceUrl, creative, performance.kind, saved). There is no spend field.

You need a PeekPanda account and an API key. Each run is one call against your plan's daily API and MCP allowance (30 calls a day on Peek, 1,000 on Panda, reset at 00:00 UTC).

## Use it

```bash
git clone https://github.com/fdarkaou/paid-ad-rails && cd paid-ad-rails
export PEEKPANDA_TOKEN=...   # API key from Account → API keys. Keep it out of source control.

node cli.js                                         # default shelves
node cli.js --platform meta --advertisers 12        # one ad platform, more advertiser shelves
node cli.js --category "Health & Fitness" --sort longest_running --rail-size 8
node cli.js --search "calorie"                      # advertiser or creative text (max 120)
node cli.js --state rails-state.json                # what changed since last run
node cli.js --format csv > rails.csv
node cli.js --webhook "$SLACK_WEBHOOK_URL"          # Discord webhook URLs work too
```

Try it without an account on the bundled example:

```bash
node cli.js --file examples/rails.json
cp examples/previous.json /tmp/state.json && node cli.js --file examples/rails.json --state /tmp/state.json
npm test
```

Options: `--platform`, `--category`, `--search`, `--sort`, `--rail-size`, `--advertisers`, `--state`, `--archive`, `--format md|csv|json`, `--webhook`, `--file`, `--tenancy`, `--api`. On a `429 rate_limited` with a short `Retry-After` it waits and retries once; on `daily_call_limit` it stops. A search that matches more than about 30,000 ads answers `422 invalid_request` — use a more specific term, or page matches through Search paid ads.

## Ask an assistant instead

If your assistant is connected to the PeekPanda MCP server (`https://mcp.peekpanda.com/mcp`, OAuth sign-in or an API key; see [MCP setup](https://peekpanda.com/docs/mcp.md)), ask it to call `get_ads`:

```json
{
  "request": {
    "action": "rails",
    "query": { "platform": "meta", "advertiserLimit": 8, "railSize": 10 }
  }
}
```

Save the result and run `node cli.js --file`, or paste it into the browser version.

## How to read it

- Everything here describes ads PeekPanda collected. There is no spend, impression, reach or country field: Meta does not publish them. A longer run does not prove an ad worked.
- Feature shelves list creatives that match a fixed product rule (`launched-this-week`, `still-live-after-90-days`). Advertiser shelves list creatives for one advertiser plus that advertiser's standing.
- "N in all" is `totalItems` from the response. The shelf may show fewer creatives than that (capped by `railSize`).
- Run days on a creative are this tool's reading of `startedAt` → `endedAt` (or today when the ad is still live). They are not a performance metric.
- Diffs compare shelves by `key`, standing moves by liveAds / newLast7Days / liveBeyond30Days / medianRunDays, and creatives by `id`.
- A dash means unavailable (null), not zero. `unlinkedAds` are ads that belong to no app.

## Weekly post in GitHub Actions

`.github/workflows/rails-digest.yml` is an example job that runs every Monday, keeps last week's report in the Actions cache, writes the report to the run summary, posts a short summary to a webhook and saves a CSV and a dated history as an artifact. Add `PEEKPANDA_TOKEN` and `RAILS_WEBHOOK_URL` as repository secrets, set the repository variable `ENABLE_PAID_AD_RAILS` to `true`, and edit the filters in the job.

## License

MIT
