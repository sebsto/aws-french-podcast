#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "boto3>=1.35.0",
# ]
# ///
"""
Historical CloudFront Logs Backfill Script (One-Time)

Reprocesses historical CloudFront logs from the old account using the same
IAB v2.2 filtering as the production Lambda function. Produces daily aggregate
files compatible with the production pipeline.

Differences from production Lambda:
- Reads from local directory (/tmp/podcast-cf-logs/) or old S3 bucket
- URI pattern: /media/{N}.mp3 (no /awsfr/ prefix)
- Outputs to s3://podcast-stormacq-net/analytics-state/daily/

Usage:
    python3 backfill.py --local /tmp/podcast-cf-logs/
    python3 backfill.py --s3  # reads from old S3 bucket
    python3 backfill.py --local /tmp/podcast-cf-logs/ --start 2025-06 --end 2026-07
    python3 backfill.py --dry-run --local /tmp/podcast-cf-logs/  # preview without uploading
"""
import argparse
import json
import os
import sys
import gzip
import io
import re
import glob
import collections
import logging
from datetime import datetime, timezone
from urllib.parse import unquote

import boto3

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# Import filtering logic from the production handler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from handler import is_bot, truncate_ipv6, BOT_PATTERNS

# Old URI pattern: /media/{N}.mp3 (without /awsfr/ prefix)
OLD_MP3_URI_PATTERN = re.compile(r'^/media/(\d+)\.mp3$')

# Output configuration
OUTPUT_BUCKET = 'podcast-stormacq-net'
OUTPUT_PREFIX = 'analytics-state/daily/'
FILE_THRESHOLD = 960000  # 960KB minimum

def parse_args():
    parser = argparse.ArgumentParser(description='Backfill historical CloudFront logs')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--local', help='Local directory with log files (gzipped)')
    source.add_argument('--s3', action='store_true', help='Read from old S3 bucket')
    parser.add_argument('--start', help='Start month (YYYY-MM), default: 2025-06', default='2025-06')
    parser.add_argument('--end', help='End month (YYYY-MM), default: 2026-07', default='2026-07')
    parser.add_argument('--dry-run', action='store_true', help='Preview without uploading')
    parser.add_argument('--profile', default='podcast', help='AWS profile for output bucket')
    parser.add_argument('--old-profile', default='podcast-old', help='AWS profile for old bucket')
    return parser.parse_args()


def list_local_logs(directory, start_month, end_month):
    """List all .gz log files in the local directory within date range."""
    all_files = []
    for root, dirs, files in os.walk(directory):
        for f in files:
            if f.endswith('.gz'):
                # Try to extract date from filename
                # CloudFront log files: DISTID.YYYY-MM-DD-HH.uniqueid.gz
                date_match = re.search(r'(\d{4}-\d{2}-\d{2})', f)
                if date_match:
                    file_date = date_match.group(1)
                    file_month = file_date[:7]
                    if start_month <= file_month <= end_month:
                        all_files.append(os.path.join(root, f))
    return sorted(all_files)


def list_s3_logs(session, start_month, end_month):
    """List log files from old S3 bucket within date range."""
    s3 = session.client('s3', region_name='us-east-1')
    bucket = 'aws-podcasts-cloudfront-logs'
    prefix = 'PodcastEnFrancais/'
    
    paginator = s3.get_paginator('list_objects_v2')
    all_files = []
    
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get('Contents', []):
            key = obj['Key']
            date_match = re.search(r'(\d{4}-\d{2}-\d{2})', key)
            if date_match:
                file_date = date_match.group(1)
                file_month = file_date[:7]
                if start_month <= file_month <= end_month:
                    all_files.append({'Bucket': bucket, 'Key': key})
    
    return sorted(all_files, key=lambda x: x['Key'])


def parse_log_file_local(filepath):
    """Parse a local gzipped CloudFront log file."""
    records = []
    try:
        with gzip.open(filepath, 'rt', encoding='utf-8', errors='replace') as f:
            for line in f:
                record = parse_line(line)
                if record:
                    records.append(record)
    except Exception as e:
        logger.warning(f"Failed to parse {filepath}: {e}")
    return records


def parse_log_file_s3(s3_client, bucket, key):
    """Parse an S3 gzipped CloudFront log file."""
    records = []
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        with gzip.GzipFile(fileobj=io.BytesIO(response['Body'].read())) as gz:
            for line in io.TextIOWrapper(gz, encoding='utf-8', errors='replace'):
                record = parse_line(line)
                if record:
                    records.append(record)
    except Exception as e:
        logger.warning(f"Failed to parse s3://{bucket}/{key}: {e}")
    return records


def parse_line(line):
    """Parse a single log line. Returns dict or None."""
    if line.startswith('#'):
        return None
    
    fields = line.strip().split('\t')
    if len(fields) < 32:
        return None
    
    date_str = fields[0]
    time_str = fields[1]
    sc_bytes_str = fields[3]
    ip = fields[4]
    method = fields[5]
    uri = fields[7]
    status_str = fields[8]
    ua_raw = fields[10]
    sc_range_start = fields[30] if len(fields) > 30 else '-'
    sc_range_end = fields[31] if len(fields) > 31 else '-'

    # Only GET
    if method != 'GET':
        return None

    # Only 200/206
    try:
        status = int(status_str)
    except ValueError:
        return None
    if status not in (200, 206):
        return None

    # OLD URI pattern: /media/{N}.mp3
    match = OLD_MP3_URI_PATTERN.match(uri)
    if not match:
        return None

    episode = match.group(1)
    ua = unquote(ua_raw) if ua_raw != '-' else ''

    try:
        sc_bytes = int(sc_bytes_str) if sc_bytes_str != '-' else 0
    except ValueError:
        sc_bytes = 0

    # 2-byte range probe detection
    is_range_probe = False
    if sc_range_start != '-' and sc_range_end != '-':
        try:
            if int(sc_range_start) == 0 and int(sc_range_end) == 1:
                is_range_probe = True
        except ValueError:
            pass

    return {
        'date': date_str,
        'time': time_str,
        'ip': ip,
        'ua': ua,
        'episode': episode,
        'sc_bytes': sc_bytes,
        'status': status,
        'is_range_probe': is_range_probe,
    }


def apply_filters(records):
    """Apply IAB v2.2 filtering + deduplication."""
    # Count per IP per day
    ip_day_counts = collections.Counter()
    for r in records:
        ip_day_counts[(r['date'], r['ip'])] += 1

    # Filter
    filtered = []
    for r in records:
        if is_bot(r['ua']):
            continue
        if r['is_range_probe']:
            continue
        if r['sc_bytes'] < FILE_THRESHOLD:
            continue
        if ip_day_counts[(r['date'], r['ip'])] > 1000:
            continue
        filtered.append(r)

    # Deduplicate
    seen = set()
    deduplicated = []
    for r in sorted(filtered, key=lambda x: (x['date'], x['time'])):
        ip = truncate_ipv6(r['ip'])
        key = (r['date'], ip, r['ua'], r['episode'])
        if key not in seen:
            seen.add(key)
            deduplicated.append(r)

    return deduplicated


def aggregate_by_day(records):
    """Group records into per-day aggregates."""
    daily = collections.defaultdict(lambda: {
        'downloads': 0,
        'listeners': set(),
        'episodes': collections.Counter(),
    })

    for r in records:
        date = r['date']
        ip = truncate_ipv6(r['ip'])
        daily[date]['downloads'] += 1
        daily[date]['listeners'].add((ip, r['ua']))
        daily[date]['episodes'][r['episode']] += 1

    # Convert to JSON-serializable
    result = {}
    for date, data in daily.items():
        result[date] = {
            'date': date,
            'downloads': data['downloads'],
            'listeners': len(data['listeners']),
            'episodes': dict(data['episodes']),
            'countries': {},  # No GeoIP for historical (would need .mmdb)
        }
    return result


def upload_daily_files(daily_metrics, session, dry_run=False):
    """Upload daily aggregate files to S3."""
    s3 = session.client('s3', region_name='eu-central-1')
    
    for date, data in sorted(daily_metrics.items()):
        year = date[:4]
        key = f"{OUTPUT_PREFIX}{year}/{date}.json"
        body = json.dumps(data, ensure_ascii=False)
        
        if dry_run:
            logger.info(f"  [DRY-RUN] Would upload {key}: {data['downloads']} downloads, {data['listeners']} listeners")
        else:
            s3.put_object(
                Bucket=OUTPUT_BUCKET,
                Key=key,
                Body=body,
                ContentType='application/json'
            )
            logger.info(f"  Uploaded {key}: {data['downloads']} downloads, {data['listeners']} listeners")


def main():
    args = parse_args()
    
    logger.info(f"Backfill: {args.start} to {args.end}")
    logger.info(f"Source: {'local ' + args.local if args.local else 'S3 (old bucket)'}")
    logger.info(f"Dry run: {args.dry_run}")

    # Collect log files
    if args.local:
        log_files = list_local_logs(args.local, args.start, args.end)
        logger.info(f"Found {len(log_files)} log files to process")
    else:
        old_session = boto3.Session(profile_name=args.old_profile)
        log_files = list_s3_logs(old_session, args.start, args.end)
        logger.info(f"Found {len(log_files)} log files in S3")

    if not log_files:
        logger.info("No log files found in date range. Exiting.")
        return

    # Process in monthly batches for memory efficiency
    output_session = boto3.Session(profile_name=args.profile)
    all_records = []
    total_raw = 0
    total_filtered = 0

    batch_size = 100  # Process 100 files at a time
    for i in range(0, len(log_files), batch_size):
        batch = log_files[i:i+batch_size]
        logger.info(f"Processing batch {i//batch_size + 1} ({len(batch)} files)...")

        batch_records = []
        for item in batch:
            if args.local:
                records = parse_log_file_local(item)
            else:
                s3_client = boto3.Session(profile_name=args.old_profile).client('s3', region_name='us-east-1')
                records = parse_log_file_s3(s3_client, item['Bucket'], item['Key'])
            batch_records.extend(records)

        total_raw += len(batch_records)
        all_records.extend(batch_records)

    logger.info(f"Total raw MP3 records: {total_raw}")

    # Apply filters and dedup
    deduplicated = apply_filters(all_records)
    total_filtered = len(deduplicated)
    logger.info(f"After filtering + dedup: {total_filtered} unique downloads")
    logger.info(f"Filtered out: {total_raw - total_filtered} ({(total_raw - total_filtered) / max(total_raw, 1) * 100:.1f}%)")

    # Aggregate by day
    daily_metrics = aggregate_by_day(deduplicated)
    logger.info(f"Aggregated into {len(daily_metrics)} days")

    # Upload
    upload_daily_files(daily_metrics, output_session, dry_run=args.dry_run)

    # Summary
    monthly_totals = collections.defaultdict(lambda: {'downloads': 0, 'listeners': 0})
    for date, data in daily_metrics.items():
        month = date[:7]
        monthly_totals[month]['downloads'] += data['downloads']
        monthly_totals[month]['listeners'] += data['listeners']

    logger.info("\n=== Monthly Summary ===")
    for month in sorted(monthly_totals.keys()):
        t = monthly_totals[month]
        logger.info(f"  {month}: {t['downloads']:,} downloads, {t['listeners']:,} daily-unique-listeners (sum, not deduped across days)")

    logger.info("\nBackfill complete!")


if __name__ == '__main__':
    main()
