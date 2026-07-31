"""
Podcast Analytics Pipeline - CloudFront Log Processor

Processes CloudFront standard access logs to produce IAB v2.2-compliant
podcast download metrics. Runs daily via EventBridge.
"""
import json
import os
import gzip
import io
import re
import collections
import logging
import urllib.request
import urllib.error
import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment
LOG_BUCKET = os.environ.get('LOG_BUCKET', '')
LOG_PREFIX = os.environ.get('LOG_PREFIX', 'cloudfront-logs/')
WEBSITE_BUCKET = os.environ.get('WEBSITE_BUCKET', '')
OUTPUT_KEY = os.environ.get('OUTPUT_KEY', 'awsfr/site/data/analytics.json')
STATE_PREFIX = os.environ.get('STATE_PREFIX', 'analytics-state/')
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN', '')
OP3_TOKEN_PARAM = os.environ.get('OP3_TOKEN_PARAM', '/podcast/op3-api-token')
OP3_SHOW_UUID = os.environ.get('OP3_SHOW_UUID', 'd8347e02-cf46-566b-924b-468b4d848aee')

# Lazy-initialized clients (avoids credential resolution at import time)
_s3 = None
_sns = None
_ssm = None


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client('s3')
    return _s3


def _get_sns():
    global _sns
    if _sns is None:
        _sns = boto3.client('sns')
    return _sns


def _get_ssm():
    global _ssm
    if _ssm is None:
        _ssm = boto3.client('ssm')
    return _ssm

# Try to load GeoIP database
_geoip_reader = None
try:
    import maxminddb
    _geoip_db_path = os.path.join(os.path.dirname(__file__), 'GeoLite2-Country.mmdb')
    if os.path.exists(_geoip_db_path):
        _geoip_reader = maxminddb.open_database(_geoip_db_path)
except Exception:
    _geoip_reader = None

# --- Bot patterns for IAB v2.2 filtering ---

BOT_PATTERNS = [
    # Generic
    'bot', 'crawler', 'spider', 'scraper', 'fetcher',
    'wget', 'curl', 'python-requests', 'python-urllib',
    'go-http-client', 'java/', 'libwww', 'httpunit', 'okhttp',
    # Search engines
    'googlebot', 'bingbot', 'yandexbot', 'baiduspider',
    'duckduckbot', 'applebot',
    # Social
    'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'slackbot', 'telegrambot', 'whatsapp', 'discordbot',
    # SEO
    'semrush', 'ahrefs', 'mj12bot', 'dotbot', 'bytespider', 'petalbot',
    # Monitoring
    'pingdom', 'uptimerobot', 'statuscake', 'newrelic', 'datadog',
    # Podcast analytics bots
    'chartable', 'podsights', 'podscribe', 'podroll',
    'podcorn', 'podcastindex',
    # AI
    'gptbot', 'claudebot', 'anthropic', 'cohere',
    # Headless browsers
    'headlesschrome', 'phantomjs', 'selenium', 'puppeteer',
    # Feed readers
    'feedfetcher', 'feedvalidator', 'feedburner', 'feedly', 'newsblur',
    # Infrastructure
    'amazoncf', 'cloudfront', 'amazonaws',
]

# URI pattern: /awsfr/media/{N}.mp3
MP3_URI_PATTERN = re.compile(r'^/awsfr/media/(\d+)\.mp3$')


def is_bot(ua):
    """Check if a user-agent string is a bot."""
    if not ua or len(ua) < 5:
        return True
    ua_lower = ua.lower()
    # Apple Watch UAs
    if ua_lower.startswith('atc/'):
        return True
    if '(null)/(null) watchos' in ua_lower:
        return True
    # Pattern matching
    return any(p in ua_lower for p in BOT_PATTERNS)


def truncate_ipv6(ip):
    """Truncate IPv6 address to /64 (first 4 groups)."""
    if ':' not in ip:
        return ip
    parts = ip.split(':')
    return ':'.join(parts[:4])


def lookup_country(ip):
    """Look up country code from IP using GeoIP database."""
    if _geoip_reader is None:
        return 'XX'
    try:
        result = _geoip_reader.get(ip)
        if result and 'country' in result and 'iso_code' in result['country']:
            return result['country']['iso_code']
    except Exception:
        pass
    return 'XX'


def fetch_op3_comparison():
    """Fetch OP3 metrics for parallel comparison. Returns dict or None."""
    try:
        # Get token from SSM
        token_response = _get_ssm().get_parameter(
            Name=OP3_TOKEN_PARAM,
            WithDecryption=True
        )
        token = token_response['Parameter']['Value']

        base_url = 'https://op3.dev/api/1'
        headers = {'Authorization': f'Bearer {token}'}

        # Fetch show download counts
        url = f'{base_url}/queries/show-download-counts?showUuid={OP3_SHOW_UUID}'
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            counts_data = json.loads(resp.read())

        show_counts = counts_data.get('showDownloadCounts', {}).get(OP3_SHOW_UUID, {})

        # Fetch episode downloads
        url = f'{base_url}/queries/show-episode-downloads?showUuid={OP3_SHOW_UUID}'
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            episodes_data = json.loads(resp.read())

        # Build comparison object
        episode_downloads = []
        for ep in episodes_data.get('episodes', [])[:30]:
            # Extract episode number from title or itemGuid
            ep_title = ep.get('title', '')
            ep_downloads_30 = ep.get('downloads30', 0)
            ep_downloads_all = ep.get('downloadsAll', 0)

            # Try to extract episode number from the title
            ep_match = re.search(r'(?:Episode\s+|Ep\s*\.?\s*|#)(\d+)', ep_title, re.IGNORECASE)
            if not ep_match:
                # Try from pubdate ordering (episodes are in order)
                continue

            episode_downloads.append({
                'episode': int(ep_match.group(1)),
                'op3Downloads30d': ep_downloads_30,
                'op3DownloadsAll': ep_downloads_all,
            })

        return {
            'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'monthlyDownloads30d': show_counts.get('monthlyDownloads', 0),
            'weeklyAvgDownloads': show_counts.get('weeklyAvgDownloads', 0),
            'episodeDownloads': episode_downloads[:30],
        }

    except Exception as e:
        logger.warning("OP3 comparison failed: %s", str(e))
        return None


def main(event, context):
    """Lambda entry point."""
    logger.info("Analytics pipeline started at %s", datetime.now(timezone.utc).isoformat())

    try:
        # Step 1: Read watermark (last processed timestamp)
        watermark = read_watermark()
        logger.info("Watermark: %s", watermark)

        # Step 2: List new log files since watermark
        new_logs = list_new_logs(watermark)
        logger.info("Found %d new log files to process", len(new_logs))

        if not new_logs:
            logger.info("No new logs to process. Exiting.")
            return {"statusCode": 200, "body": "No new logs"}

        # Step 3: Parse and filter logs
        records = parse_and_filter_logs(new_logs)
        logger.info("Parsed %d valid MP3 download records", len(records))

        # Step 4: Apply IAB v2.2 filtering
        filtered = apply_iab_filtering(records)
        logger.info("After IAB filtering: %d records", len(filtered))

        # Step 5: Deduplicate
        deduplicated = deduplicate(filtered)
        logger.info("After deduplication: %d unique downloads", len(deduplicated))

        # Step 6: Aggregate metrics
        daily_metrics = aggregate_daily(deduplicated)

        # Step 7: Write daily aggregate
        write_daily_aggregate(daily_metrics)

        # Step 8: Recompute analytics.json
        analytics = compute_analytics_json()

        # Step 8b: Fetch OP3 comparison data
        op3_data = fetch_op3_comparison()
        if op3_data:
            analytics['op3Comparison'] = op3_data
            logger.info("OP3 comparison data fetched successfully")
        else:
            analytics['op3Comparison'] = None
            analytics['op3Error'] = "OP3 API unavailable or returned error"
            logger.warning("OP3 comparison data unavailable")

        # Step 9: Upload analytics.json
        upload_analytics(analytics)

        # Step 10: Update watermark
        update_watermark(new_logs)

        logger.info("Pipeline completed successfully. Processed %d downloads.", len(deduplicated))
        return {"statusCode": 200, "body": f"Processed {len(deduplicated)} downloads"}

    except Exception as e:
        logger.error("Pipeline failed: %s", str(e), exc_info=True)
        notify_failure(str(e))
        raise


def read_watermark():
    """Read the last processed timestamp from S3."""
    try:
        response = _get_s3().get_object(
            Bucket=WEBSITE_BUCKET,
            Key=f"{STATE_PREFIX}watermark.json"
        )
        return json.loads(response['Body'].read())
    except ClientError as e:
        if e.response['Error']['Code'] in ('NoSuchKey', '404'):
            return {"last_processed": None, "last_key": None}
        return {"last_processed": None, "last_key": None}
    except Exception:
        return {"last_processed": None, "last_key": None}


def list_new_logs(watermark):
    """List CloudFront log files newer than the watermark."""
    paginator = _get_s3().get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(
        Bucket=LOG_BUCKET,
        Prefix=LOG_PREFIX
    )

    last_processed = watermark.get('last_processed')
    if last_processed:
        if isinstance(last_processed, str):
            watermark_dt = datetime.fromisoformat(last_processed.replace('Z', '+00:00'))
        else:
            watermark_dt = last_processed
    else:
        watermark_dt = None

    new_files = []
    for page in page_iterator:
        for obj in page.get('Contents', []):
            # Skip non-log files (e.g., directories)
            if not obj['Key'].endswith('.gz'):
                continue
            if watermark_dt is None:
                new_files.append(obj)
            else:
                obj_modified = obj['LastModified']
                if obj_modified.tzinfo is None:
                    obj_modified = obj_modified.replace(tzinfo=timezone.utc)
                if obj_modified > watermark_dt:
                    new_files.append(obj)

    return sorted(new_files, key=lambda x: x['LastModified'])


def parse_and_filter_logs(log_files):
    """Parse CloudFront W3C logs and filter for MP3 downloads."""
    records = []

    for log_file in log_files:
        try:
            response = _get_s3().get_object(Bucket=LOG_BUCKET, Key=log_file['Key'])
            compressed_data = response['Body'].read()

            # Decompress gzip
            with gzip.GzipFile(fileobj=io.BytesIO(compressed_data)) as gz:
                content = gz.read().decode('utf-8', errors='replace')

            for line in content.splitlines():
                # Skip comment lines (headers start with #)
                if line.startswith('#'):
                    continue

                fields = line.split('\t')
                # CloudFront standard logs have 33 fields
                if len(fields) < 32:
                    continue

                date_str = fields[0]       # date
                time_str = fields[1]       # time
                sc_bytes_str = fields[3]   # sc-bytes
                ip = fields[4]            # c-ip
                method = fields[5]        # cs-method
                uri = fields[7]           # cs-uri-stem
                status_str = fields[8]    # sc-status
                ua_raw = fields[10]       # cs(User-Agent)
                query = fields[11]        # cs-uri-query
                sc_range_start = fields[30] if len(fields) > 30 else '-'
                sc_range_end = fields[31] if len(fields) > 31 else '-'

                # Filter: only GET requests
                if method != 'GET':
                    continue

                # Filter: only status 200 or 206
                try:
                    status = int(status_str)
                except ValueError:
                    continue
                if status not in (200, 206):
                    continue

                # Filter: URI must match /awsfr/media/*.mp3
                match = MP3_URI_PATTERN.match(uri)
                if not match:
                    continue

                episode = match.group(1)

                # URL-decode the User-Agent
                ua = unquote(ua_raw) if ua_raw != '-' else ''

                # Parse sc-bytes
                try:
                    sc_bytes = int(sc_bytes_str) if sc_bytes_str != '-' else 0
                except ValueError:
                    sc_bytes = 0

                # Detect 2-byte range probe from range fields
                is_range_probe = False
                if sc_range_start != '-' and sc_range_end != '-':
                    try:
                        r_start = int(sc_range_start)
                        r_end = int(sc_range_end)
                        if r_start == 0 and r_end == 1:
                            is_range_probe = True
                    except ValueError:
                        pass

                records.append({
                    'date': date_str,
                    'time': time_str,
                    'ip': ip,
                    'ua': ua,
                    'episode': episode,
                    'sc_bytes': sc_bytes,
                    'status': status,
                    'is_range_probe': is_range_probe,
                    'country': lookup_country(ip),
                })

        except Exception as e:
            logger.warning("Failed to process log file %s: %s", log_file['Key'], str(e))
            continue

    return records


def apply_iab_filtering(records):
    """Apply IAB v2.2 filtering rules (bots, thresholds, etc.)."""
    # Count requests per IP per day for excessive IP detection
    ip_day_counts = collections.Counter()
    for r in records:
        ip_day_counts[(r['date'], r['ip'])] += 1

    filtered = []
    for r in records:
        # Remove bots (includes Apple Watch, empty/short UAs)
        if is_bot(r['ua']):
            continue

        # Remove 2-byte range probes
        if r['is_range_probe']:
            continue

        # Remove below-threshold downloads (< 960KB)
        if r['sc_bytes'] < 960000:
            continue

        # Remove excessive IPs (> 1000 requests per day)
        if ip_day_counts[(r['date'], r['ip'])] > 1000:
            continue

        filtered.append(r)

    return filtered


def deduplicate(records):
    """Deduplicate per IP+UA+episode per UTC day."""
    seen = set()
    deduplicated = []

    # Sort by date and time to keep earliest request
    sorted_records = sorted(records, key=lambda x: (x['date'], x['time']))

    for r in sorted_records:
        ip = truncate_ipv6(r['ip'])
        key = (r['date'], ip, r['ua'], r['episode'])
        if key not in seen:
            seen.add(key)
            deduplicated.append(r)

    return deduplicated


def aggregate_daily(records):
    """Aggregate records into daily metrics."""
    daily = collections.defaultdict(lambda: {
        'downloads': 0,
        'listeners': set(),
        'episodes': collections.Counter(),
        'countries': collections.Counter(),
    })

    for r in records:
        date = r['date']
        ip = truncate_ipv6(r['ip'])
        daily[date]['downloads'] += 1
        daily[date]['listeners'].add((ip, r['ua']))
        daily[date]['episodes'][r['episode']] += 1
        daily[date]['countries'][r['country']] += 1

    # Convert to serializable format
    metrics = {}
    for date, data in daily.items():
        metrics[date] = {
            'date': date,
            'downloads': data['downloads'],
            'listeners': len(data['listeners']),
            'episodes': dict(data['episodes']),
            'countries': dict(data['countries']),
        }

    return metrics


def write_daily_aggregate(metrics):
    """Write daily aggregate JSON to S3."""
    for date, data in metrics.items():
        key = f"{STATE_PREFIX}daily/{date}.json"
        _get_s3().put_object(
            Bucket=WEBSITE_BUCKET,
            Key=key,
            Body=json.dumps(data, ensure_ascii=False),
            ContentType='application/json'
        )
        logger.info("Wrote daily aggregate for %s: %d downloads", date, data['downloads'])


def compute_analytics_json():
    """Recompute the full analytics.json from all daily files."""
    # Read all daily files from last 24 months
    cutoff = datetime.now(timezone.utc) - timedelta(days=730)
    cutoff_str = cutoff.strftime('%Y-%m-%d')

    paginator = _get_s3().get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(
        Bucket=WEBSITE_BUCKET,
        Prefix=f"{STATE_PREFIX}daily/"
    )

    daily_files = []
    for page in page_iterator:
        for obj in page.get('Contents', []):
            # Extract date from key: analytics-state/daily/YYYY-MM-DD.json
            key = obj['Key']
            filename = key.rsplit('/', 1)[-1]
            if not filename.endswith('.json'):
                continue
            date_str = filename.replace('.json', '')
            if date_str >= cutoff_str:
                daily_files.append(key)

    # Read all daily aggregate files
    all_daily = []
    for key in daily_files:
        try:
            response = _get_s3().get_object(Bucket=WEBSITE_BUCKET, Key=key)
            data = json.loads(response['Body'].read())
            all_daily.append(data)
        except Exception as e:
            logger.warning("Failed to read daily file %s: %s", key, str(e))
            continue

    # Sort by date
    all_daily.sort(key=lambda x: x['date'])

    # Compute monthly downloads and listeners
    monthly_downloads = collections.defaultdict(int)
    monthly_listeners = collections.defaultdict(int)
    episode_downloads = collections.Counter()
    country_downloads = collections.Counter()

    # Last 30 days for summary
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).strftime('%Y-%m-%d')

    total_30d_downloads = 0
    listeners_30d = set()

    for day in all_daily:
        date_str = day['date']
        month = date_str[:7]  # YYYY-MM

        monthly_downloads[month] += day['downloads']

        # For monthly listeners, we'd need IP+UA per month — approximate with daily count
        # Since we don't store individual records, use the daily listener count
        monthly_listeners[month] += day.get('listeners', 0) if isinstance(day.get('listeners'), int) else 0

        # Per-episode totals
        for ep, count in day.get('episodes', {}).items():
            episode_downloads[ep] += count

        # Country aggregation
        for country, count in day.get('countries', {}).items():
            country_downloads[country] += count

        # 30-day summary
        if date_str >= thirty_days_ago:
            total_30d_downloads += day['downloads']
            listeners_30d_count = day.get('listeners', 0)
            if isinstance(listeners_30d_count, int):
                # We accumulate daily unique listeners as an approximation
                total_30d_listeners_approx = True

    # Sum of daily unique listeners (not deduplicated across days)
    # This over-counts since the same listener on multiple days is counted each day.
    # True monthly uniques would require storing per-listener hashes across days.
    unique_listeners_30d = sum(
        day.get('listeners', 0) for day in all_daily
        if day['date'] >= thirty_days_ago and isinstance(day.get('listeners'), int)
    )

    # Build monthly arrays (sorted by month)
    sorted_months = sorted(monthly_downloads.keys())
    monthly_downloads_arr = [
        {'month': m, 'count': monthly_downloads[m]}
        for m in sorted_months
    ]
    monthly_listeners_arr = [
        {'month': m, 'count': monthly_listeners[m]}
        for m in sorted_months
    ]

    # Top 50 episodes by downloads
    top_episodes = episode_downloads.most_common(50)
    episode_downloads_arr = [
        {'episode': int(ep), 'totalDownloads': count}
        for ep, count in top_episodes
    ]

    # Top 20 countries
    top_countries = country_downloads.most_common(20)
    top_countries_arr = [
        {'countryCode': code, 'count': count}
        for code, count in top_countries
    ]

    # Total episodes (unique episode numbers seen)
    total_episodes = len(episode_downloads)

    analytics = {
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'summary': {
            'totalDownloads30d': total_30d_downloads,
            'uniqueListeners30d': unique_listeners_30d,
            'totalEpisodes': total_episodes,
        },
        'monthlyDownloads': monthly_downloads_arr,
        'monthlyListeners': monthly_listeners_arr,
        'episodeDownloads': episode_downloads_arr,
        'topCountries': top_countries_arr,
    }

    return analytics


def upload_analytics(analytics):
    """Upload analytics.json to the website bucket."""
    _get_s3().put_object(
        Bucket=WEBSITE_BUCKET,
        Key=OUTPUT_KEY,
        Body=json.dumps(analytics, ensure_ascii=False, indent=2),
        ContentType='application/json',
        CacheControl='max-age=3600',
    )
    logger.info("Uploaded analytics.json to s3://%s/%s", WEBSITE_BUCKET, OUTPUT_KEY)


def update_watermark(processed_logs):
    """Update the watermark with the latest processed log."""
    if not processed_logs:
        return
    latest = max(processed_logs, key=lambda x: x['LastModified'])
    watermark = {
        "last_processed": latest['LastModified'].isoformat() if hasattr(latest['LastModified'], 'isoformat') else latest['LastModified'],
        "last_key": latest['Key']
    }
    _get_s3().put_object(
        Bucket=WEBSITE_BUCKET,
        Key=f"{STATE_PREFIX}watermark.json",
        Body=json.dumps(watermark),
        ContentType='application/json'
    )


def notify_failure(error_message):
    """Send failure notification via SNS."""
    if not SNS_TOPIC_ARN:
        logger.warning("No SNS_TOPIC_ARN configured, skipping notification")
        return
    try:
        _get_sns().publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject="Podcast Analytics Pipeline Failed",
            Message=f"The podcast analytics pipeline failed with error:\n\n{error_message}\n\nTime: {datetime.now(timezone.utc).isoformat()}"
        )
    except Exception as e:
        logger.error("Failed to send SNS notification: %s", str(e))
