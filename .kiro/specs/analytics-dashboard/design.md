# Design Document

## Overview

This design describes a serverless analytics pipeline that processes CloudFront access logs to produce IAB v2.2-compliant podcast download metrics, stored as a static JSON file and rendered by a client-side dashboard.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     AWS Account 226945380156 (eu-central-1)            │
│                                                                        │
│  ┌─────────────┐     ┌──────────────────┐     ┌────────────────┐    │
│  │ CloudFront  │────▶│ S3: cf-logs/     │     │ S3: podcast-   │    │
│  │ Distribution│     │ (gzipped W3C)    │     │ stormacq-net   │    │
│  │             │     └────────┬─────────┘     │                │    │
│  └─────────────┘              │               │ awsfr/site/    │    │
│                               │               │  data/         │    │
│                               ▼               │   analytics.   │    │
│  ┌──────────────┐    ┌───────────────┐       │   json         │    │
│  │ EventBridge  │───▶│ Lambda        │──────▶│                │    │
│  │ (daily cron) │    │ (Python 3.12) │       └────────────────┘    │
│  └──────────────┘    │               │                              │
│                      │ • Parse logs   │       ┌────────────────┐    │
│                      │ • IAB filter   │       │ S3: analytics- │    │
│                      │ • Deduplicate  │◀─────▶│ state/         │    │
│                      │ • Aggregate    │       │ watermark.json │    │
│                      └───────────────┘       │ daily/*.json   │    │
│                                               └────────────────┘    │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. CloudFront Standard Access Logging

**What**: Enable standard logging on the existing CloudFront distribution (podcast.stormacq.net).

**Log format**: W3C extended format, gzipped, delivered to S3. Key fields:

| CloudFront field | IAB use |
|---|---|
| `c-ip` | IP for deduplication + geo lookup |
| `cs(User-Agent)` | UA for deduplication + bot filtering |
| `cs-uri-stem` | Episode identification (`/awsfr/media/{N}.mp3`) |
| `sc-status` | HTTP status filtering (200, 206 only) |
| `sc-bytes` | File threshold check (≥ 960KB) |
| `cs-method` | Exclude HEAD requests |
| `cs(Range)` | Detect 2-byte probes (`bytes=0-1`) |
| `date` + `time` | 24h UTC deduplication window |
| `x-edge-location` | Fallback geo approximation |

**Country resolution**: CloudFront standard logs do NOT include a `country` field directly. We use **MaxMind GeoLite2 Country** database (free, ~6MB) bundled with the Lambda for IP → country lookup.

### 2. Lambda Pipeline Function

**Runtime**: Python 3.12  
**Memory**: 512 MB  
**Timeout**: 5 minutes  
**Trigger**: EventBridge daily at 04:00 UTC  
**Deployment size**: ~35MB (code + GeoLite2 database)

#### Processing Flow

```
1. Read watermark (last processed log file timestamp)
2. List new log files in S3 since watermark
3. For each log file:
   a. Download & gunzip
   b. Parse tab-separated W3C fields
   c. Filter: only GET /awsfr/media/*.mp3 with status 200|206
4. Apply IAB v2.2 filtering:
   a. Remove bot UAs (pattern matching)
   b. Remove Apple Watch UAs (atc/ prefix, null/null watchOS)
   c. Remove empty/malformed UAs (< 5 chars)
   d. Remove 2-byte range probes
   e. Remove requests below file threshold (< 960KB sc-bytes)
5. Detect and exclude excessive IPs (> 1000 requests/day)
6. Deduplicate per (IP + UA + episode) per UTC day
   - IPv6 truncated to /64
7. GeoIP lookup for country (MaxMind GeoLite2)
8. Aggregate into daily summary
9. Write/update daily aggregate file in S3
10. Recompute analytics.json from all daily files (last 24 months)
11. Upload analytics.json to website bucket
12. Update watermark
```

#### State Management (S3-based, no database)

```
s3://podcast-stormacq-net/analytics-state/
├── watermark.json              # Last processed timestamp + log key
├── daily/
│   ├── 2026-07-29.json         # That day's aggregated metrics
│   ├── 2026-07-28.json
│   └── ...  (last 24 months)
└── episodes.json               # Cumulative per-episode totals
```

**Daily aggregate file schema**:
```json
{
  "date": "2026-07-29",
  "downloads": 432,
  "listeners": 298,
  "episodes": {"381": 45, "380": 32, "379": 28},
  "countries": {"FR": 290, "BE": 52, "CH": 38, "CA": 22}
}
```

### 3. IAB v2.2 Filtering Implementation

#### Step 1.2: Bot Filtering

```python
BOT_PATTERNS = [
    'bot', 'crawler', 'spider', 'scraper', 'fetcher',
    'curl', 'wget', 'python-requests', 'python-urllib',
    'go-http-client', 'java/', 'libwww', 'httpunit',
    'nutch', 'biglotron', 'teoma', 'gigabot',
    'ia_archiver', 'httrack', 'yandex', 'ahrefs',
    'semrush', 'mj12bot', 'dotbot', 'petalbot',
    'bingbot', 'googlebot', 'facebookexternalhit',
]

APPLE_WATCH_FILTERS = [
    lambda ua: ua.startswith('atc/'),
    lambda ua: '(null)/(null) watchos' in ua.lower(),
]

def is_bot(user_agent: str) -> bool:
    if len(user_agent) < 5:
        return True
    ua_lower = user_agent.lower()
    return (
        any(p in ua_lower for p in BOT_PATTERNS) or
        any(f(user_agent) for f in APPLE_WATCH_FILTERS)
    )
```

#### Step 1.3: HTTP Handling
- **Include**: GET with status 200, 206
- **Exclude**: HEAD, status 304, all 4xx/5xx
- **Exclude**: Range `bytes=0-1` (2-byte probe)

#### Step 2: File Threshold
- Minimum bytes: 960,000 (= 128kbps × 60s)
- For 206: accumulate total bytes per (IP+UA+episode) within day

#### Step 3: Deduplication
```python
def truncate_ipv6(ip: str) -> str:
    if ':' not in ip:
        return ip
    parts = ip.split(':')
    return ':'.join(parts[:4])

def deduplicate(records):
    seen = set()
    for r in sorted(records, key=lambda x: x['time']):
        ip = truncate_ipv6(r['ip'])
        key = (r['date'], ip, r['ua'], r['episode'])
        if key not in seen:
            seen.add(key)
            yield r
```

### 4. Metrics JSON Output

Written to `s3://podcast-stormacq-net/awsfr/site/data/analytics.json`:

```json
{
  "generatedAt": "2026-07-30T04:05:23Z",
  "summary": {
    "totalDownloads30d": 12450,
    "uniqueListeners30d": 4230,
    "totalEpisodes": 381
  },
  "monthlyDownloads": [
    {"month": "2024-08", "count": 9800},
    {"month": "2026-07", "count": 12450}
  ],
  "monthlyListeners": [
    {"month": "2024-08", "count": 3100},
    {"month": "2026-07", "count": 4230}
  ],
  "episodeDownloads": [
    {"episode": 381, "title": "What's New Week 30", "totalDownloads": 2340},
    {"episode": 380, "title": "Amazon Bedrock Agents", "totalDownloads": 1980}
  ],
  "topCountries": [
    {"countryCode": "FR", "count": 8460},
    {"countryCode": "BE", "count": 1494},
    {"countryCode": "CH", "count": 996}
  ],
  "op3Comparison": {
    "fetchedAt": "2026-07-30T04:05:10Z",
    "monthlyDownloads30d": 12100,
    "weeklyAvgDownloads": 3025,
    "episodeDownloads": [
      {"episode": 381, "op3Downloads30d": 1850, "op3DownloadsAll": 2280},
      {"episode": 380, "op3Downloads30d": 1620, "op3DownloadsAll": 1940}
    ]
  }
}
```

### 5. Dashboard Frontend

- **URL**: `/web/stats/index.html`
- **Data**: fetches `data/analytics.json` (static file, no API)
- **Charts**: Chart.js 4.x, bar + line charts, AWS orange theme
- **Layout**: Bootstrap 5 responsive grid, KPI cards + charts + table
- **Dark mode**: adapts to site theme toggle
- **Methodology section**: IAB v2.2 compliance text in French

### 6. CDK Infrastructure Additions

All in existing `PipelineStack`:
- S3 log bucket with tiered lifecycle (transition to IA after 90 days, delete after 365 days)
- Lambda function (Python 3.12, 512MB, 5min)
- EventBridge daily rule
- IAM permissions (read logs, read/write website bucket + state prefix)
- SNS publish to existing failure topic

### 7. Cost Estimate

| Component | Monthly Cost |
|-----------|------|
| CloudFront standard logging | Free |
| S3 storage: logs (~5MB/day × 365d, IA after 90d) | $0.02 |
| Lambda (1 inv/day × 30s × 512MB) | $0.01 |
| S3 API calls | $0.01 |
| **Total** | **< $0.05/month** |

### 10. OP3 Parallel Comparison

#### Purpose
Run both measurement systems in parallel for 6 months to validate the CloudFront pipeline's accuracy against OP3's independently-computed, IAB-compliant metrics.

#### OP3 API Integration

**Show UUID**: `d8347e02-cf46-566b-924b-468b4d848aee`

**Endpoints used by Lambda**:
| Endpoint | Data Retrieved |
|----------|---------------|
| `GET /api/1/queries/show-download-counts?showUuid={uuid}` | `monthlyDownloads`, `weeklyAvgDownloads` |
| `GET /api/1/queries/show-episode-downloads?showUuid={uuid}` | Per-episode: `downloads1`, `downloads7`, `downloads30`, `downloadsAll` |

**Authentication**: Bearer token stored in SSM Parameter Store (`/podcast/op3-api-token`), read by Lambda at invocation.

**Error handling**: OP3 API call is wrapped in try/except. On failure, `op3Comparison` is set to `null` and `op3Error` contains the error message. The pipeline continues normally.

#### Dashboard Comparison UI

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Comparaison des sources (validation 6 mois)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Métrique            CloudFront    OP3       Écart          │
│  ─────────────────────────────────────────────────────      │
│  Downloads (30j)     12,450        12,100    +2.9% ✅       │
│  Moy. hebdo          3,112         3,025     +2.9% ✅       │
│                                                             │
│  Ep 381 (30j)        1,920         1,850     +3.8% ✅       │
│  Ep 380 (30j)        1,650         1,620     +1.9% ✅       │
│  Ep 379 (30j)        1,480         1,510     -2.0% ✅       │
│                                                             │
│  ✅ = écart < 10%    ⚠️ = écart ≥ 10%                      │
└─────────────────────────────────────────────────────────────┘
```

Discrepancies > 10% are highlighted in orange (⚠️) to flag potential pipeline issues.

#### Expected Differences

Small differences (2-5%) are normal because:
- OP3 sees the request at prefix level (before CloudFront cache); CloudFront logs see all requests including cache hits
- OP3 uses a hashed IP; CloudFront logs use the actual IP
- Slightly different bot lists
- OP3 deduplicates by hashed IP per UTC day; we deduplicate by full IP+UA per UTC day

#### Sunset Plan
After 6 months, if metrics converge (< 5% average discrepancy):
1. Remove OP3 API calls from Lambda
2. Remove `op3Comparison` from JSON schema
3. Remove comparison section from dashboard
4. Optionally remove op3.dev prefix from media URL chain
