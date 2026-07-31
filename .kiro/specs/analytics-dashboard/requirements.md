# Requirements Document

## Introduction

A podcast analytics dashboard for podcast.stormacq.net that uses CloudFront standard access logs as its authoritative data source. A serverless pipeline processes raw logs, applies IAB Podcast Measurement Technical Guidelines v2.2 filtering rules, computes aggregate metrics, and writes a static JSON file consumed by a public dashboard page on the website.

## Glossary

- **Pipeline**: The AWS Lambda function triggered daily by EventBridge that reads CloudFront access logs from S3, applies filtering, and produces aggregate metrics as a JSON file
- **Dashboard**: The static HTML page at `/web/stats/index.html` that renders metrics using Chart.js from a pre-generated JSON file
- **Download**: A valid podcast file request that passes all IAB v2.2 filtering steps (bot exclusion, HTTP validation, file threshold, deduplication)
- **Listener**: A unique combination of IP address + User Agent within a 24-hour UTC window
- **CloudFront_Log**: A standard CloudFront access log file deposited into an S3 prefix by AWS
- **Metrics_JSON**: The JSON file produced by the Pipeline and served as a static asset from the website S3 bucket
- **IAB_Filter**: The set of filtering rules defined in IAB Podcast Measurement Technical Guidelines v2.2 Section 5.4
- **Bot**: An automated user agent identified by known bot UA strings, data center IP ranges, malformed UAs, or excessive download patterns
- **Deduplication_Window**: A 24-hour UTC calendar day window within which repeated requests from the same IP+UA for the same file are counted as one download
- **CDK_Stack**: The existing AWS CDK stack at `scripts/cdk-build/pipeline/lib/cdk-stack.ts` that manages the CloudFront distribution, S3 bucket, and deployment pipeline

## Requirements

### Requirement 1: Enable CloudFront Access Logging

**User Story:** As a podcast host, I want CloudFront to log all access requests, so that I have raw data to compute accurate download metrics.

#### Acceptance Criteria

1. WHEN the CDK stack is deployed, THE CDK_Stack SHALL enable standard access logging on the existing CloudFront distribution
2. WHEN CloudFront produces log files, THE CDK_Stack SHALL store them in an S3 bucket with prefix `cloudfront-logs/` in the same AWS account (226945380156, eu-central-1)
3. THE CDK_Stack SHALL configure log file delivery to the logging bucket with CloudFront's default batching interval (up to a few minutes)
4. THE CDK_Stack SHALL configure an S3 lifecycle rule to transition log objects to Infrequent Access (IA) storage class after 90 days
5. THE CDK_Stack SHALL configure an S3 lifecycle rule to permanently delete log objects after 365 days

### Requirement 2: Filter MP3 Download Requests

**User Story:** As a podcast host, I want the pipeline to isolate only MP3 download requests from all CloudFront traffic, so that metrics reflect podcast consumption exclusively.

#### Acceptance Criteria

1. WHEN processing log entries, THE Pipeline SHALL select only requests matching URI path pattern `/awsfr/media/*.mp3`
2. WHEN processing log entries, THE Pipeline SHALL exclude requests for non-MP3 resources (HTML, CSS, JS, images)
3. WHEN processing log entries, THE Pipeline SHALL exclude requests with HTTP method HEAD
4. WHEN processing log entries, THE Pipeline SHALL include only requests with HTTP status 200 or 206

### Requirement 3: IAB v2.2 Bot Filtering (Section 5.4, Step 1.2)

**User Story:** As a podcast host, I want automated bot traffic excluded from my metrics, so that download counts reflect genuine human listeners.

#### Acceptance Criteria

1. WHEN a request User-Agent matches a known bot pattern from the IAB bot list, THE Pipeline SHALL exclude that request from download counts
2. WHEN a request User-Agent starts with `atc/` or contains `(null)/(null) watchOS`, THE Pipeline SHALL exclude that request as an Apple Watch pre-fetch
3. WHEN a request User-Agent is empty or malformed (fewer than 5 characters), THE Pipeline SHALL exclude that request
4. WHEN a single IP address generates more than 1000 MP3 requests in a 24-hour window, THE Pipeline SHALL exclude all requests from that IP for that window
5. WHEN a request originates from a known data center IP range, THE Pipeline SHALL exclude that request

### Requirement 4: IAB v2.2 HTTP and File Threshold Filtering (Section 5.4, Steps 1.3 and 2)

**User Story:** As a podcast host, I want only substantive downloads counted, so that incomplete or speculative requests do not inflate metrics.

#### Acceptance Criteria

1. WHEN a request has HTTP status 304 (Not Modified), THE Pipeline SHALL exclude that request
2. WHEN a request is a 206 (Partial Content) with bytes transferred less than the file threshold, THE Pipeline SHALL exclude that request
3. THE Pipeline SHALL define the file threshold as the MP3 file header size plus 1 minute of audio content at 128 kbps (approximately 960 KB)
4. WHEN a request has a 2-byte range (e.g., `bytes=0-1`), THE Pipeline SHALL exclude that request as a probe

### Requirement 5: IAB v2.2 Deduplication (Section 5.4, Step 3)

**User Story:** As a podcast host, I want repeated downloads from the same listener for the same episode to be counted only once per day, so that metrics reflect actual audience reach.

#### Acceptance Criteria

1. WHEN multiple requests for the same MP3 file come from the same IP address and User-Agent within a 24-hour UTC window, THE Pipeline SHALL count only the first request
2. WHEN deduplicating IPv6 addresses, THE Pipeline SHALL truncate to the first 64 bits before comparison
3. THE Pipeline SHALL use a UTC calendar day (00:00–23:59 UTC) as the deduplication window boundary

### Requirement 6: Aggregate Metrics Computation

**User Story:** As a podcast host, I want the pipeline to compute monthly and per-episode aggregate metrics, so that the dashboard can display meaningful trends.

#### Acceptance Criteria

1. WHEN processing is complete, THE Pipeline SHALL compute total downloads per calendar month for the last 24 months
2. WHEN processing is complete, THE Pipeline SHALL compute unique listeners per calendar month (distinct IP+UA combinations) for the last 24 months
3. WHEN processing is complete, THE Pipeline SHALL compute total downloads per episode file for all episodes
4. WHEN processing is complete, THE Pipeline SHALL compute download counts grouped by country code (using CloudFront's geo-location field from the log) for the last 90 days
5. WHEN processing is complete, THE Pipeline SHALL write a single Metrics_JSON file to the website S3 bucket at path `awsfr/site/data/analytics.json`

### Requirement 7: Pipeline Scheduling and Execution

**User Story:** As a podcast host, I want the pipeline to run automatically on a daily schedule, so that metrics stay current without manual intervention.

#### Acceptance Criteria

1. THE Pipeline SHALL be triggered once per day by an EventBridge scheduled rule
2. WHEN the Pipeline executes, THE Pipeline SHALL process all CloudFront log files not yet processed (incremental processing using a high-water-mark timestamp)
3. IF the Pipeline encounters an error during execution, THEN THE Pipeline SHALL log the error to CloudWatch and send a notification to the existing SNS topic (aws-french-podcast-build-failures)
4. THE Pipeline SHALL complete execution within 5 minutes for a typical daily log volume
5. THE Pipeline SHALL consume less than 512 MB of memory during execution

### Requirement 8: Metrics JSON Structure

**User Story:** As a frontend developer, I want the metrics JSON file to have a well-defined structure, so that the dashboard can reliably parse and display the data.

#### Acceptance Criteria

1. THE Metrics_JSON SHALL contain a `generatedAt` field with ISO 8601 timestamp of generation
2. THE Metrics_JSON SHALL contain a `monthlyDownloads` array of objects with `month` (YYYY-MM) and `count` fields
3. THE Metrics_JSON SHALL contain a `monthlyListeners` array of objects with `month` (YYYY-MM) and `count` fields
4. THE Metrics_JSON SHALL contain an `episodeDownloads` array of objects with `episode` (filename without extension), `title` (if resolvable), and `totalDownloads` fields
5. THE Metrics_JSON SHALL contain a `topCountries` array of objects with `countryCode` (ISO 3166-1 alpha-2) and `count` fields, sorted descending by count, limited to top 20
6. THE Metrics_JSON SHALL contain a `summary` object with `totalDownloads30d`, `uniqueListeners30d`, and `totalEpisodes` fields

### Requirement 9: Dashboard Display

**User Story:** As a podcast listener or potential sponsor, I want to see clear podcast audience metrics on a public page, so that I can understand the show's reach.

#### Acceptance Criteria

1. THE Dashboard SHALL display three KPI cards: total downloads (last 30 days), unique listeners (last 30 days), and total episodes
2. THE Dashboard SHALL display a monthly downloads chart (area or bar) covering the last 12-24 months
3. THE Dashboard SHALL display a monthly unique listeners chart (line or bar) covering the last 12-24 months
4. THE Dashboard SHALL display a horizontal bar chart of top episodes by total downloads (last 20-30 episodes)
5. THE Dashboard SHALL display a table of top 10 countries by download count
6. THE Dashboard SHALL include a methodology section explaining IAB v2.2 compliance and data source
7. WHEN the page loads, THE Dashboard SHALL fetch the Metrics_JSON file from the relative path `/awsfr/data/analytics.json`

### Requirement 10: Dashboard Visual Design

**User Story:** As a visitor, I want the dashboard to be readable on any device and match the site's look and feel, so that the experience is consistent.

#### Acceptance Criteria

1. THE Dashboard SHALL be responsive and render correctly on viewports from 320px to 1920px wide
2. THE Dashboard SHALL respect the site's existing dark/light theme toggle
3. THE Dashboard SHALL use Chart.js as the charting library
4. THE Dashboard SHALL load and render within 3 seconds on a standard broadband connection
5. THE Dashboard SHALL display a loading state while the Metrics_JSON file is being fetched
6. IF the Metrics_JSON file fails to load, THEN THE Dashboard SHALL display a user-friendly error message

### Requirement 11: Infrastructure Cost Constraints

**User Story:** As a solo developer, I want the analytics pipeline to cost less than $5/month, so that it remains affordable for a personal project.

#### Acceptance Criteria

1. THE Pipeline SHALL use AWS Lambda for compute (pay-per-invocation, no always-on resources)
2. THE Pipeline SHALL use S3 for all storage (logs, metrics JSON)
3. THE Pipeline SHALL NOT use Athena, Glue, RDS, DynamoDB, or any always-on service
4. THE CDK_Stack SHALL deploy all analytics infrastructure within the existing AWS account (226945380156) and region (eu-central-1)
5. WHEN running at daily frequency with ~381 episodes of historical log data, THE Pipeline SHALL incur less than $5/month in total AWS costs

### Requirement 12: CDK Integration

**User Story:** As a developer, I want all infrastructure defined in CDK alongside the existing stack, so that deployment is automated and reproducible.

#### Acceptance Criteria

1. THE CDK_Stack SHALL define the CloudFront logging configuration, Lambda function, EventBridge rule, and IAM roles as CDK constructs
2. WHEN the CDK stack is deployed, THE CDK_Stack SHALL grant the Lambda function read access to the CloudFront logs bucket and write access to the website S3 bucket at the `awsfr/site/data/` prefix
3. THE CDK_Stack SHALL package the Lambda function code as part of the CDK deployment

### Requirement 13: OP3 Parallel Comparison (6-Month Validation)

**User Story:** As a podcast host, I want to compare my CloudFront-based metrics against OP3's independently-computed numbers for 6 months, so that I can validate my pipeline's accuracy before relying on it exclusively.

#### Acceptance Criteria

1. WHEN the Pipeline executes daily, THE Pipeline SHALL also query the OP3 API to retrieve the show's download counts and per-episode download counts
2. THE Pipeline SHALL store the OP3 API bearer token as an environment variable (from AWS Secrets Manager or SSM Parameter Store)
3. THE Metrics_JSON SHALL contain an `op3Comparison` object with the following fields:
   - `monthlyDownloads30d`: OP3's reported monthly downloads (last 30 days)
   - `weeklyAvgDownloads`: OP3's reported weekly average downloads
   - `episodeDownloads`: array of objects with `episode`, `op3Downloads30d`, and `op3DownloadsAll` for the most recent 30 episodes
4. THE Dashboard SHALL display a comparison section showing CloudFront-based metrics side-by-side with OP3 metrics
5. THE Dashboard comparison section SHALL visually highlight discrepancies greater than 10% between the two sources
6. AFTER 6 months of parallel operation, THE comparison feature MAY be removed or converted to an optional toggle
7. IF the OP3 API is unavailable or returns an error, THE Pipeline SHALL still complete successfully and set `op3Comparison` to `null` with an `op3Error` field describing the failure
