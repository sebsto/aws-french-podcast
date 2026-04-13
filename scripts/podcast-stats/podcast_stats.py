#!/usr/bin/env python3
"""
Podcast audience statistics from CloudFront logs.

Downloads logs from S3 month by month and computes:
- Unique listeners (IP + User-Agent hash) per month and last 30 days
- Total MP3 downloads per month and last 30 days
- Filters out bot traffic

Usage:
    python3 podcast_stats.py [--months N] [--output text|csv|json]

Options:
    --months N   Number of months to analyze (default: all available, from 2024-07)
    --output     Output format: text (default), csv, json
    --cache      Use previously downloaded logs if available
"""

import argparse
import gzip
import hashlib
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote

# ---------------------------------------------------------------------------
# Bot detection
# ---------------------------------------------------------------------------
BOT_PATTERNS = re.compile(
    r"("
    # Generic bots / crawlers
    r"bot\b|crawl|spider|slurp|scraper|fetch|wget|curl\b|python-requests"
    r"|libwww-perl|java/|httpclient|okhttp|go-http-client|ruby|perl"
    # Search engine bots
    r"|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot"
    r"|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot"
    r"|whatsapp|discordbot|pinterestbot"
    # Feed readers / validators (server-side)
    r"|feedfetcher|feedvalidator|feedburner|feedly|newsblur|inoreader"
    r"|theoldreader|netvibes|superfeedr"
    # Monitoring / uptime
    r"|pingdom|uptimerobot|statuscake|newrelic|datadog|site24x7"
    r"|nagios|zabbix|munin|monit"
    # Podcast-specific bots / prefetch services
    r"|podtrac|chartable|podsights|podscribe|podroll|podcorn"
    r"|castbox.*crawler|overcast.*sync|podcastindex"
    # AWS / cloud infra
    r"|amazoncf|cloudfront|amazonaws|elastic"
    # AI / SEO bots
    r"|headlesschrome|phantomjs|selenium|puppeteer|playwright"
    r"|ltx71|semrush|ahrefs|mj12bot|dotbot|rogerbot|screaming.frog"
    r"|bytespider|gptbot|claudebot|anthropic|cohere-ai"
    # Apple iTunes metadata service (not a real listener)
    r"|iTMS"
    r")",
    re.IGNORECASE,
)

MIN_UA_LENGTH = 10

S3_BUCKET = "aws-podcasts-cloudfront-logs"
S3_PREFIX = "PodcastEnFrancais/"
AWS_PROFILE = "podcast"
AWS_REGION = "eu-central-1"
CACHE_DIR = Path("/tmp/podcast-cf-logs")


def is_bot(user_agent: str) -> bool:
    if not user_agent or user_agent == "-" or len(user_agent) < MIN_UA_LENGTH:
        return True
    return bool(BOT_PATTERNS.search(user_agent))


def listener_hash(ip: str, user_agent: str) -> str:
    raw = f"{ip}|{user_agent}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def list_log_files_for_date_prefix(date_prefix: str) -> list[str]:
    """List S3 keys matching a date prefix like '2026-03'."""
    cmd = [
        "aws", "s3api", "list-objects-v2",
        "--bucket", S3_BUCKET,
        "--prefix", S3_PREFIX,
        "--query", f"Contents[?contains(Key, '.{date_prefix}')].Key",
        "--output", "text",
        "--profile", AWS_PROFILE,
        "--region", AWS_REGION,
    ]
    # This approach is slow for large buckets. Instead, list all and filter locally.
    # Better: use aws s3 ls and grep
    cmd = [
        "aws", "s3", "ls",
        f"s3://{S3_BUCKET}/{S3_PREFIX}",
        "--profile", AWS_PROFILE,
        "--region", AWS_REGION,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error listing S3: {result.stderr}", file=sys.stderr)
        return []
    keys = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 4:
            filename = parts[3]
            if f".{date_prefix}" in filename:
                keys.append(filename)
    return keys


def download_logs_for_month(year_month: str) -> Path:
    """Download all log files for a given YYYY-MM to cache dir. Returns dir path."""
    month_dir = CACHE_DIR / year_month
    month_dir.mkdir(parents=True, exist_ok=True)

    # Check if already cached
    existing = list(month_dir.glob("*.gz"))
    if existing:
        print(f"  {year_month}: using {len(existing)} cached files")
        return month_dir

    print(f"  {year_month}: downloading from S3...")

    # Use aws s3 cp --recursive with --exclude/--include is not great for this.
    # Instead, sync all files and filter. But that's slow too.
    # Best approach: list files, then download in parallel.

    # First, get the full listing (we'll cache it)
    listing_file = CACHE_DIR / "full_listing.txt"
    if not listing_file.exists():
        print("  Building file listing from S3 (one-time, may take a minute)...")
        cmd = [
            "aws", "s3", "ls",
            f"s3://{S3_BUCKET}/{S3_PREFIX}",
            "--profile", AWS_PROFILE,
            "--region", AWS_REGION,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error listing S3: {result.stderr}", file=sys.stderr)
            sys.exit(1)
        listing_file.write_text(result.stdout)

    # Filter for this month
    listing = listing_file.read_text()
    files_to_download = []
    for line in listing.splitlines():
        parts = line.split()
        if len(parts) >= 4:
            filename = parts[3]
            # Filenames look like: E1ISBCP7FGZK4S.2026-03-15-08.abc123.gz
            if f".{year_month}-" in filename:
                files_to_download.append(filename)

    if not files_to_download:
        print(f"  {year_month}: no log files found")
        return month_dir

    print(f"  {year_month}: downloading {len(files_to_download)} files...")

    def download_one(filename):
        src = f"s3://{S3_BUCKET}/{S3_PREFIX}{filename}"
        dst = month_dir / filename
        if dst.exists():
            return
        subprocess.run(
            ["aws", "s3", "cp", src, str(dst),
             "--profile", AWS_PROFILE, "--region", AWS_REGION, "--quiet"],
            capture_output=True,
        )

    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = [pool.submit(download_one, f) for f in files_to_download]
        done = 0
        for future in as_completed(futures):
            done += 1
            if done % 500 == 0:
                print(f"    ... {done}/{len(files_to_download)}")
            future.result()  # raise exceptions

    actual = list(month_dir.glob("*.gz"))
    print(f"  {year_month}: {len(actual)} files ready")
    return month_dir


def process_month_dir(month_dir: Path) -> dict:
    """Process all log files in a directory. Returns raw data."""
    results = {
        "listeners": set(),
        "downloads": 0,
        "bytes": 0,
        "episodes": defaultdict(lambda: {"listeners": set(), "downloads": 0}),
        "daily_listeners": defaultdict(set),
        "daily_downloads": defaultdict(int),
        "bot_filtered": 0,
        "mp3_requests": 0,
        "total_lines": 0,
    }

    for log_file in sorted(month_dir.glob("*.gz")):
        try:
            with gzip.open(log_file, "rt", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    results["total_lines"] += 1

                    fields = line.split("\t")
                    if len(fields) < 33:
                        continue

                    status = fields[8]
                    uri = fields[7]

                    if status not in ("200", "206"):
                        continue
                    if not uri.lower().endswith(".mp3"):
                        continue

                    results["mp3_requests"] += 1

                    user_agent = unquote(fields[10])
                    if is_bot(user_agent):
                        results["bot_filtered"] += 1
                        continue

                    date_str = fields[0]
                    ip = fields[4]
                    sc_bytes = int(fields[3]) if fields[3].isdigit() else 0

                    ep_match = re.search(r"/media/(\d+)\.mp3", uri, re.IGNORECASE)
                    episode = int(ep_match.group(1)) if ep_match else None

                    lid = listener_hash(ip, user_agent)

                    results["listeners"].add(lid)
                    results["downloads"] += 1
                    results["bytes"] += sc_bytes
                    results["daily_listeners"][date_str].add(lid)
                    results["daily_downloads"][date_str] += 1

                    if episode is not None:
                        results["episodes"][episode]["listeners"].add(lid)
                        results["episodes"][episode]["downloads"] += 1

        except Exception as e:
            print(f"  Warning: {log_file.name}: {e}", file=sys.stderr)

    return results


def get_available_months() -> list[str]:
    """Get list of YYYY-MM months available in the logs."""
    listing_file = CACHE_DIR / "full_listing.txt"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if not listing_file.exists():
        print("Building file listing from S3 (one-time)...")
        cmd = [
            "aws", "s3", "ls",
            f"s3://{S3_BUCKET}/{S3_PREFIX}",
            "--profile", AWS_PROFILE,
            "--region", AWS_REGION,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error listing S3: {result.stderr}", file=sys.stderr)
            sys.exit(1)
        listing_file.write_text(result.stdout)

    listing = listing_file.read_text()
    months = set()
    for line in listing.splitlines():
        parts = line.split()
        if len(parts) >= 4:
            match = re.search(r"\.(\d{4}-\d{2})-\d{2}", parts[3])
            if match:
                months.add(match.group(1))
    return sorted(months)


def format_bytes(b: int | float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(b) < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


def print_text_report(monthly_data: dict, last30_data: dict, processing_stats: dict):
    print("\n" + "=" * 70)
    print("  PODCAST AWS EN FRANÇAIS — AUDIENCE STATISTICS")
    print("=" * 70)

    # Processing stats
    total_lines = sum(s["total_lines"] for s in processing_stats.values())
    mp3_reqs = sum(s["mp3_requests"] for s in processing_stats.values())
    bot_filt = sum(s["bot_filtered"] for s in processing_stats.values())

    print(f"\nLog processing summary:")
    print(f"  Total log lines:        {total_lines:>12,}")
    print(f"  MP3 requests (200/206): {mp3_reqs:>12,}")
    print(f"  Bot traffic filtered:   {bot_filt:>12,}")
    if mp3_reqs > 0:
        print(f"  Bot ratio:              {bot_filt / mp3_reqs * 100:>11.1f}%")

    # Monthly summary
    print(f"\n{'─' * 70}")
    print(f"  MONTHLY OVERVIEW")
    print(f"{'─' * 70}")
    print(f"  {'Month':<10} {'Unique Listeners':>18} {'Downloads':>12} {'Data Served':>14}")
    print(f"  {'─' * 10} {'─' * 18} {'─' * 12} {'─' * 14}")

    all_listeners = set()
    all_downloads = 0
    all_bytes = 0

    for month in sorted(monthly_data.keys()):
        m = monthly_data[month]
        n_listeners = len(m["listeners"])
        n_downloads = m["downloads"]
        n_bytes = m["bytes"]
        all_listeners.update(m["listeners"])
        all_downloads += n_downloads
        all_bytes += n_bytes
        print(
            f"  {month:<10} {n_listeners:>18,} {n_downloads:>12,} "
            f"{format_bytes(n_bytes):>14}"
        )

    print(f"  {'─' * 10} {'─' * 18} {'─' * 12} {'─' * 14}")
    print(
        f"  {'TOTAL':<10} {len(all_listeners):>18,} {all_downloads:>12,} "
        f"{format_bytes(all_bytes):>14}"
    )

    # Last 30 days
    print(f"\n{'─' * 70}")
    print(f"  LAST 30 DAYS")
    print(f"{'─' * 70}")
    cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    print(f"  Period: {cutoff} → {datetime.now().strftime('%Y-%m-%d')}")
    print(f"  Unique listeners: {len(last30_data['listeners']):>10,}")
    print(f"  Total downloads:  {last30_data['downloads']:>10,}")
    print(f"  Data served:      {format_bytes(last30_data['bytes']):>10}")

    # Top episodes last 30 days
    if last30_data["episodes"]:
        print(f"\n  Top 20 episodes (last 30 days, by downloads):")
        print(f"  {'Episode':>8} {'Downloads':>12} {'Unique Listeners':>18}")
        print(f"  {'─' * 8} {'─' * 12} {'─' * 18}")
        sorted_eps = sorted(
            last30_data["episodes"].items(),
            key=lambda x: x[1]["downloads"],
            reverse=True,
        )
        for ep, d in sorted_eps[:20]:
            print(f"  {ep:>8} {d['downloads']:>12,} {len(d['listeners']):>18,}")

    print(f"\n{'=' * 70}")
    print(f"  Unique listener = hash(IP + User-Agent). Bot traffic filtered.")
    print(f"  Data covers: {sorted(monthly_data.keys())[0]} to {sorted(monthly_data.keys())[-1]}")
    print(f"{'=' * 70}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Podcast audience statistics from CloudFront logs"
    )
    parser.add_argument("--months", type=int, default=None, help="Limit to last N months")
    parser.add_argument(
        "--output", choices=["text", "csv", "json"], default="text", help="Output format"
    )
    parser.add_argument(
        "--refresh-listing", action="store_true",
        help="Force refresh of the S3 file listing"
    )
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if args.refresh_listing:
        listing_file = CACHE_DIR / "full_listing.txt"
        if listing_file.exists():
            listing_file.unlink()

    # Determine which months to process
    available = get_available_months()
    if not available:
        print("No log data found.", file=sys.stderr)
        sys.exit(1)

    if args.months:
        available = available[-args.months:]

    print(f"Available months: {available[0]} to {available[-1]}")
    print(f"Processing {len(available)} months...\n")

    # Download and process each month
    monthly_data = {}
    processing_stats = {}
    cutoff_30d = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

    last30 = {
        "listeners": set(),
        "downloads": 0,
        "bytes": 0,
        "episodes": defaultdict(lambda: {"listeners": set(), "downloads": 0}),
    }

    for ym in available:
        month_dir = download_logs_for_month(ym)
        result = process_month_dir(month_dir)

        monthly_data[ym] = {
            "listeners": result["listeners"],
            "downloads": result["downloads"],
            "bytes": result["bytes"],
        }
        processing_stats[ym] = {
            "total_lines": result["total_lines"],
            "mp3_requests": result["mp3_requests"],
            "bot_filtered": result["bot_filtered"],
        }

        # Accumulate last-30-days data from daily breakdowns
        for day, lids in result["daily_listeners"].items():
            if day >= cutoff_30d:
                last30["listeners"].update(lids)
        for day, count in result["daily_downloads"].items():
            if day >= cutoff_30d:
                last30["downloads"] += count
        # For last30 bytes and episodes, we need to reprocess with date filter
        # The daily breakdown doesn't have bytes/episodes, so let's add that
        # Actually, let's compute it from the episode data for recent months
        for ep, ep_data in result["episodes"].items():
            # We can't filter by day at episode level without more granular data
            # For the last-30-day episode breakdown, we only include months
            # that overlap with the 30-day window
            ym_start = f"{ym}-01"
            ym_end_month = int(ym.split("-")[1])
            ym_end_year = int(ym.split("-")[0])
            if ym_end_month == 12:
                ym_end = f"{ym_end_year + 1}-01-01"
            else:
                ym_end = f"{ym_end_year}-{ym_end_month + 1:02d}-01"

            if ym_end > cutoff_30d:
                # This month overlaps with last 30 days — include episode data
                # (approximate: we include the full month if it overlaps)
                pass

    # For accurate last-30-day episode data, reprocess the relevant months
    # with day-level filtering. Let's do a targeted pass.
    print("\nComputing last-30-day episode breakdown...")
    relevant_months = set()
    cutoff_dt = datetime.now() - timedelta(days=30)
    for ym in available:
        y, m = map(int, ym.split("-"))
        # Month overlaps with last 30 days if its last day >= cutoff
        if m == 12:
            month_end = datetime(y + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = datetime(y, m + 1, 1) - timedelta(days=1)
        if month_end >= cutoff_dt:
            relevant_months.add(ym)

    for ym in sorted(relevant_months):
        month_dir = CACHE_DIR / ym
        for log_file in sorted(month_dir.glob("*.gz")):
            try:
                with gzip.open(log_file, "rt", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        fields = line.split("\t")
                        if len(fields) < 33:
                            continue
                        status = fields[8]
                        uri = fields[7]
                        if status not in ("200", "206"):
                            continue
                        if not uri.lower().endswith(".mp3"):
                            continue
                        date_str = fields[0]
                        if date_str < cutoff_30d:
                            continue
                        user_agent = unquote(fields[10])
                        if is_bot(user_agent):
                            continue
                        ip = fields[4]
                        sc_bytes = int(fields[3]) if fields[3].isdigit() else 0
                        ep_match = re.search(r"/media/(\d+)\.mp3", uri, re.IGNORECASE)
                        episode = int(ep_match.group(1)) if ep_match else None
                        lid = listener_hash(ip, user_agent)

                        last30["bytes"] += sc_bytes
                        if episode is not None:
                            last30["episodes"][episode]["listeners"].add(lid)
                            last30["episodes"][episode]["downloads"] += 1
            except Exception:
                pass

    if args.output == "text":
        print_text_report(monthly_data, last30, processing_stats)
    elif args.output == "csv":
        print("type,period,unique_listeners,downloads,bytes")
        for month in sorted(monthly_data.keys()):
            m = monthly_data[month]
            print(f"monthly,{month},{len(m['listeners'])},{m['downloads']},{m['bytes']}")
        today = datetime.now().strftime("%Y-%m-%d")
        print(f"last30d,{cutoff_30d}/{today},{len(last30['listeners'])},{last30['downloads']},{last30['bytes']}")
        print()
        print("type,period,episode,unique_listeners,downloads")
        for ep, d in sorted(last30["episodes"].items(), key=lambda x: x[1]["downloads"], reverse=True):
            print(f"episode_last30d,{cutoff_30d}/{today},{ep},{len(d['listeners'])},{d['downloads']}")
    elif args.output == "json":
        import json
        out = {
            "monthly": {
                m: {"unique_listeners": len(d["listeners"]), "downloads": d["downloads"], "bytes": d["bytes"]}
                for m, d in sorted(monthly_data.items())
            },
            "last_30_days": {
                "unique_listeners": len(last30["listeners"]),
                "downloads": last30["downloads"],
                "bytes": last30["bytes"],
            },
            "top_episodes_last_30_days": {
                str(ep): {"unique_listeners": len(d["listeners"]), "downloads": d["downloads"]}
                for ep, d in sorted(last30["episodes"].items(), key=lambda x: x[1]["downloads"], reverse=True)[:20]
            },
        }
        print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
