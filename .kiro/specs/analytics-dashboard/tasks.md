# Implementation Tasks

## Phase 1: Infrastructure (CloudFront Logging + Lambda)

### Task 1: Enable CloudFront Access Logging
**References**: Requirement 1, Requirement 12

- [x] Create S3 bucket `podcast-stormacq-net-cf-logs` in CDK with 90-day lifecycle rule
- [x] Modify the existing CloudFront Distribution construct to enable standard logging to this bucket with prefix `cloudfront-logs/`
- [x] Deploy the updated CDK stack
- [x] Verify logs appear in S3 within ~15 minutes of a request

### Task 2: Create Lambda Function Scaffold
**References**: Requirement 7, Requirement 11, Requirement 12

- [x] Create directory `scripts/cdk-build/pipeline/lambda/analytics/`
- [x] Create `handler.py` with basic structure (entry point, error handling, SNS notification on failure)
- [x] Create `requirements.txt` with dependencies (`maxminddb`)
- [x] Bundle GeoLite2-Country.mmdb database in the Lambda package
- [x] Add Lambda construct to CDK stack (Python 3.12, 512MB, 5min timeout)
- [x] Add EventBridge rule (daily at 04:00 UTC) targeting the Lambda
- [x] Add IAM permissions (read log bucket, read/write website bucket at `awsfr/site/data/*` and `analytics-state/*`)
- [x] Add SNS publish permission to existing failure topic
- [x] Deploy and verify Lambda is invoked daily

### Task 3: Implement Log Parsing
**References**: Requirement 2

- [x] Implement S3 log file listing (by prefix + last-modified after watermark)
- [x] Implement gzip decompression + W3C tab-separated parsing
- [x] Filter only rows where `cs-uri-stem` matches `/awsfr/media/*.mp3`
- [x] Filter only rows where `cs-method` = `GET`
- [x] Filter only rows where `sc-status` in (200, 206)
- [x] Extract episode number from URI: `/awsfr/media/341.mp3` → `341`
- [x] URL-decode the `cs(User-Agent)` field

### Task 4: Implement IAB v2.2 Filtering
**References**: Requirement 3, Requirement 4

- [x] Implement bot UA pattern matching (list of ~30 known patterns)
- [x] Implement Apple Watch UA filtering (`atc/` prefix, `(null)/(null) watchOS`)
- [x] Implement empty/malformed UA check (< 5 chars)
- [x] Implement 2-byte range probe detection (`bytes=0-1` in Range header)
- [x] Implement file threshold check (`sc-bytes` >= 960000)
- [x] Implement excessive IP detection (> 1000 requests per IP per UTC day)

### Task 5: Implement Deduplication
**References**: Requirement 5

- [x] Implement IPv6 truncation to first 64 bits (/64 prefix)
- [x] Implement deduplication: one download per (IP + UA + episode) per UTC calendar day
- [x] Ensure dedup operates after all other filters

### Task 6: Implement Aggregation and JSON Output
**References**: Requirement 6, Requirement 8

- [x] Implement watermark read/write (S3 `analytics-state/watermark.json`)
- [x] Implement daily aggregate file write (S3 `analytics-state/daily/YYYY-MM-DD.json`)
- [x] Implement monthly rollup: sum daily downloads, count distinct listeners per month (last 24 months)
- [x] Implement per-episode cumulative totals
- [x] Implement country aggregation (last 90 days of daily files)
- [x] Implement GeoIP lookup using MaxMind GeoLite2
- [x] Generate `analytics.json` with schema: generatedAt, summary, monthlyDownloads, monthlyListeners, episodeDownloads, topCountries
- [x] Upload `analytics.json` to `s3://podcast-stormacq-net/awsfr/site/data/analytics.json`
- [x] Prune daily files older than 24 months

## Phase 2: Dashboard Frontend

### Task 7: Create Dashboard Page in Toucan
**References**: Requirement 9

- [x] Create `toucan/contents/stats/index.md` with frontmatter (title: "Statistiques", layout: stats)
- [x] Create `toucan/templates/aws_podcasts/views/pages/stats.mustache` with page structure
- [x] Add navigation link to stats page in site footer/header

### Task 8: Add Chart.js and Stats Bundle
**References**: Requirement 10

- [x] `npm install chart.js`
- [x] Create `src/js/stats.js` as a new Webpack entry point
- [x] Update `webpack.config.js` to produce a separate `stats.js` bundle
- [x] Create `src/sass/pages/_stats.scss` for dashboard-specific styles

### Task 9: Implement Dashboard UI
**References**: Requirement 9, Requirement 10

- [x] Fetch `data/analytics.json` on page load with loading state
- [x] Render 3 KPI cards: downloads 30d, listeners 30d, total episodes
- [x] Render monthly downloads bar chart (Chart.js, AWS orange theme)
- [x] Render monthly listeners line chart
- [x] Render top episodes horizontal bar chart (top 25, sorted desc)
- [x] Render top countries table with flag emojis and percentages
- [x] Add methodology section text (IAB v2.2 compliance explanation in French)
- [x] Handle error state (JSON load failure → French error message)

### Task 10: Dark Mode and Responsive Design
**References**: Requirement 10

- [x] Detect dark mode (existing `data-theme` attribute or CSS media query)
- [x] Switch Chart.js colors/grid for dark mode
- [x] Ensure charts resize responsively (container-based sizing)
- [x] Test mobile layout (KPI cards stack, charts full-width)

## Phase 3: Polish and Enhancements

### Task 11: Episode Title Enrichment
**References**: Requirement 8 (AC4)

- [x] Create a build script that generates `analytics-state/episode-titles.json` from `toucan/contents/episodes/*/index.md`
- [x] Lambda reads this file and enriches `episodeDownloads` with titles
- [x] Add the script to the build pipeline (run during `npm run dist`)

### Task 12: Historical Logs Reprocessing (One-Time Backfill)
**References**: Requirement 6 (AC1, AC2, AC3)

Reprocess 12 months of historical CloudFront logs (June 2025 – July 2026) from the old account using a throw-away copy of the Lambda function adjusted for the old distribution ID and URI path pattern (`/media/{N}.mp3` instead of `/awsfr/media/{N}.mp3`). This produces daily aggregate files using the SAME algorithm and filtering as the production pipeline, giving trustworthy historical data.

- [x] Create a one-time script `scripts/cdk-build/pipeline/lambda/analytics/backfill.py` that:
  - Reads logs from `s3://aws-podcasts-cloudfront-logs/PodcastEnFrancais/` (profile: `podcast-old`, region: `us-east-1`)
  - Adjusts URI pattern to match `/media/*.mp3` (no `/awsfr/` prefix)
  - Applies the same IAB v2.2 filtering as the production Lambda
  - Produces daily aggregate JSON files in the same format as the production pipeline
  - Writes output to `s3://podcast-stormacq-net/analytics-state/daily/` (profile: `podcast`, region: `eu-central-1`)
- [x] Run the backfill script for June 2025 through July 2026 (13 months)
- [x] Verify backfill output: compare monthly totals against `scripts/podcast-stats/data/*.json` reference (expect roughly similar numbers, differences explained by stricter IAB filtering)
- [x] After verification, regenerate `analytics.json` from all daily files (backfill + current)
- [x] Delete the backfill script (throw-away, not needed after one-time run)

### Task 13: Monitoring and Alerting
**References**: Requirement 7 (AC3)

- [x] Implement SNS notification on Lambda error
- [x] Add CloudWatch alarm for Lambda errors > 0 in 24h
- [x] Log processing stats (files processed, records filtered, downloads counted)

### Task 14: OP3 Parallel Comparison Integration
**References**: Requirement 13

- [x] Store OP3 API token in SSM Parameter Store (`/podcast/op3-api-token`)
- [x] Add `ssm:GetParameter` permission to Lambda IAM role for the parameter
- [x] Implement OP3 API client in Lambda (fetch show-download-counts and show-episode-downloads)
- [x] Add `op3Comparison` field to `analytics.json` output (with `fetchedAt`, `monthlyDownloads30d`, `weeklyAvgDownloads`, `episodeDownloads`)
- [x] Handle OP3 API failures gracefully (`op3Comparison: null`, `op3Error: "..."`)
- [x] Add comparison table to dashboard UI (CloudFront vs OP3, side-by-side)
- [x] Highlight discrepancies > 10% with warning indicator
- [x] Add a note indicating the comparison period start date and planned end date (6 months)
- [x] Set calendar reminder to evaluate and potentially remove comparison after 6 months
