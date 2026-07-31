# Implementation Tasks

## Phase 1: Infrastructure (CloudFront Logging + Lambda)

### Task 1: Enable CloudFront Access Logging
**References**: Requirement 1, Requirement 12

- [ ] Create S3 bucket `podcast-stormacq-net-cf-logs` in CDK with 90-day lifecycle rule
- [ ] Modify the existing CloudFront Distribution construct to enable standard logging to this bucket with prefix `cloudfront-logs/`
- [ ] Deploy the updated CDK stack
- [ ] Verify logs appear in S3 within ~15 minutes of a request

### Task 2: Create Lambda Function Scaffold
**References**: Requirement 7, Requirement 11, Requirement 12

- [ ] Create directory `scripts/cdk-build/pipeline/lambda/analytics/`
- [ ] Create `handler.py` with basic structure (entry point, error handling, SNS notification on failure)
- [ ] Create `requirements.txt` with dependencies (`maxminddb`)
- [ ] Bundle GeoLite2-Country.mmdb database in the Lambda package
- [ ] Add Lambda construct to CDK stack (Python 3.12, 512MB, 5min timeout)
- [ ] Add EventBridge rule (daily at 04:00 UTC) targeting the Lambda
- [ ] Add IAM permissions (read log bucket, read/write website bucket at `awsfr/site/data/*` and `analytics-state/*`)
- [ ] Add SNS publish permission to existing failure topic
- [ ] Deploy and verify Lambda is invoked daily

### Task 3: Implement Log Parsing
**References**: Requirement 2

- [ ] Implement S3 log file listing (by prefix + last-modified after watermark)
- [ ] Implement gzip decompression + W3C tab-separated parsing
- [ ] Filter only rows where `cs-uri-stem` matches `/awsfr/media/*.mp3`
- [ ] Filter only rows where `cs-method` = `GET`
- [ ] Filter only rows where `sc-status` in (200, 206)
- [ ] Extract episode number from URI: `/awsfr/media/341.mp3` → `341`
- [ ] URL-decode the `cs(User-Agent)` field

### Task 4: Implement IAB v2.2 Filtering
**References**: Requirement 3, Requirement 4

- [ ] Implement bot UA pattern matching (list of ~30 known patterns)
- [ ] Implement Apple Watch UA filtering (`atc/` prefix, `(null)/(null) watchOS`)
- [ ] Implement empty/malformed UA check (< 5 chars)
- [ ] Implement 2-byte range probe detection (`bytes=0-1` in Range header)
- [ ] Implement file threshold check (`sc-bytes` >= 960000)
- [ ] Implement excessive IP detection (> 1000 requests per IP per UTC day)

### Task 5: Implement Deduplication
**References**: Requirement 5

- [ ] Implement IPv6 truncation to first 64 bits (/64 prefix)
- [ ] Implement deduplication: one download per (IP + UA + episode) per UTC calendar day
- [ ] Ensure dedup operates after all other filters

### Task 6: Implement Aggregation and JSON Output
**References**: Requirement 6, Requirement 8

- [ ] Implement watermark read/write (S3 `analytics-state/watermark.json`)
- [ ] Implement daily aggregate file write (S3 `analytics-state/daily/YYYY-MM-DD.json`)
- [ ] Implement monthly rollup: sum daily downloads, count distinct listeners per month (last 24 months)
- [ ] Implement per-episode cumulative totals
- [ ] Implement country aggregation (last 90 days of daily files)
- [ ] Implement GeoIP lookup using MaxMind GeoLite2
- [ ] Generate `analytics.json` with schema: generatedAt, summary, monthlyDownloads, monthlyListeners, episodeDownloads, topCountries
- [ ] Upload `analytics.json` to `s3://podcast-stormacq-net/awsfr/site/data/analytics.json`
- [ ] Prune daily files older than 24 months

## Phase 2: Dashboard Frontend

### Task 7: Create Dashboard Page in Toucan
**References**: Requirement 9

- [ ] Create `toucan/contents/stats/index.md` with frontmatter (title: "Statistiques", layout: stats)
- [ ] Create `toucan/templates/aws_podcasts/views/pages/stats.mustache` with page structure
- [ ] Add navigation link to stats page in site footer/header

### Task 8: Add Chart.js and Stats Bundle
**References**: Requirement 10

- [ ] `npm install chart.js`
- [ ] Create `src/js/stats.js` as a new Webpack entry point
- [ ] Update `webpack.config.js` to produce a separate `stats.js` bundle
- [ ] Create `src/sass/pages/_stats.scss` for dashboard-specific styles

### Task 9: Implement Dashboard UI
**References**: Requirement 9, Requirement 10

- [ ] Fetch `data/analytics.json` on page load with loading state
- [ ] Render 3 KPI cards: downloads 30d, listeners 30d, total episodes
- [ ] Render monthly downloads bar chart (Chart.js, AWS orange theme)
- [ ] Render monthly listeners line chart
- [ ] Render top episodes horizontal bar chart (top 25, sorted desc)
- [ ] Render top countries table with flag emojis and percentages
- [ ] Add methodology section text (IAB v2.2 compliance explanation in French)
- [ ] Handle error state (JSON load failure → French error message)

### Task 10: Dark Mode and Responsive Design
**References**: Requirement 10

- [ ] Detect dark mode (existing `data-theme` attribute or CSS media query)
- [ ] Switch Chart.js colors/grid for dark mode
- [ ] Ensure charts resize responsively (container-based sizing)
- [ ] Test mobile layout (KPI cards stack, charts full-width)

## Phase 3: Polish and Enhancements

### Task 11: Episode Title Enrichment
**References**: Requirement 8 (AC4)

- [ ] Create a build script that generates `analytics-state/episode-titles.json` from `toucan/contents/episodes/*/index.md`
- [ ] Lambda reads this file and enriches `episodeDownloads` with titles
- [ ] Add the script to the build pipeline (run during `npm run dist`)

### Task 12: OP3 Historical Data Import (Optional)
**References**: Introduction (historical data from OP3)

- [ ] Export OP3 download data via their API for the period before CloudFront logging
- [ ] Convert to daily aggregate file format
- [ ] Upload as `analytics-state/daily/YYYY-MM-DD.json` files
- [ ] Rerun Lambda to regenerate `analytics.json` with full history

### Task 13: Monitoring and Alerting
**References**: Requirement 7 (AC3)

- [ ] Implement SNS notification on Lambda error
- [ ] Add CloudWatch alarm for Lambda errors > 0 in 24h
- [ ] Log processing stats (files processed, records filtered, downloads counted)

### Task 14: OP3 Parallel Comparison Integration
**References**: Requirement 13

- [ ] Store OP3 API token in SSM Parameter Store (`/podcast/op3-api-token`)
- [ ] Add `ssm:GetParameter` permission to Lambda IAM role for the parameter
- [ ] Implement OP3 API client in Lambda (fetch show-download-counts and show-episode-downloads)
- [ ] Add `op3Comparison` field to `analytics.json` output (with `fetchedAt`, `monthlyDownloads30d`, `weeklyAvgDownloads`, `episodeDownloads`)
- [ ] Handle OP3 API failures gracefully (`op3Comparison: null`, `op3Error: "..."`)
- [ ] Add comparison table to dashboard UI (CloudFront vs OP3, side-by-side)
- [ ] Highlight discrepancies > 10% with warning indicator
- [ ] Add a note indicating the comparison period start date and planned end date (6 months)
- [ ] Set calendar reminder to evaluate and potentially remove comparison after 6 months
