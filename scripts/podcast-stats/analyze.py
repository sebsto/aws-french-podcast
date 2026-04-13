#!/usr/bin/env python3
"""
Analyze pre-extracted MP3 download records from CloudFront logs.

Input: TSV file with columns: date, ip, user_agent, uri, status, bytes
(produced by extract_mp3.sh)

Output: Audience statistics with bot filtering.
"""

import hashlib
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from urllib.parse import unquote

INPUT_FILE = "/tmp/podcast-mp3-records.tsv"

# ---------------------------------------------------------------------------
# Bot detection
# ---------------------------------------------------------------------------
BOT_PATTERNS = re.compile(
    r"("
    r"bot\b|crawl|spider|slurp|scraper|fetch|wget|curl\b|python-requests"
    r"|libwww-perl|java/|httpclient|okhttp|go-http-client"
    r"|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot"
    r"|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot"
    r"|whatsapp|discordbot|pinterestbot"
    r"|feedfetcher|feedvalidator|feedburner|feedly|newsblur|inoreader"
    r"|pingdom|uptimerobot|statuscake|newrelic|datadog|site24x7"
    r"|nagios|zabbix"
    r"|chartable|podsights|podscribe|podroll|podcorn"
    r"|castbox.*crawler|podcastindex"
    r"|amazoncf|cloudfront|amazonaws"
    r"|headlesschrome|phantomjs|selenium|puppeteer|playwright"
    r"|ltx71|semrush|ahrefs|mj12bot|dotbot|rogerbot"
    r"|bytespider|gptbot|claudebot|anthropic|cohere-ai"
    r"|iTMS"
    r")",
    re.IGNORECASE,
)

def is_bot(ua: str) -> bool:
    if not ua or ua == "-" or len(ua) < 10:
        return True
    return bool(BOT_PATTERNS.search(ua))

def lid(ip: str, ua: str) -> str:
    return hashlib.sha256(f"{ip}|{ua}".encode()).hexdigest()[:16]

def format_bytes(b):
    for u in ("B", "KB", "MB", "GB", "TB"):
        if abs(b) < 1024:
            return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} PB"


def main():
    cutoff_30d = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    today = datetime.now().strftime("%Y-%m-%d")

    # Monthly aggregation
    monthly_listeners = defaultdict(set)
    monthly_downloads = defaultdict(int)
    monthly_bytes = defaultdict(int)

    # Last 30 days
    l30_listeners = set()
    l30_downloads = 0
    l30_bytes = 0
    l30_ep_listeners = defaultdict(set)
    l30_ep_downloads = defaultdict(int)

    # Counters
    total = 0
    bots = 0

    print("Reading records...", file=sys.stderr)

    with open(INPUT_FILE, "r") as f:
        for line in f:
            total += 1
            if total % 1_000_000 == 0:
                print(f"  {total:,} records...", file=sys.stderr)

            parts = line.rstrip("\n").split("\t")
            if len(parts) < 6:
                continue

            date_str, ip, ua_raw, uri, status, bytes_str = parts[:6]
            ua = unquote(ua_raw)

            if is_bot(ua):
                bots += 1
                continue

            month = date_str[:7]
            sc_bytes = int(bytes_str) if bytes_str.isdigit() else 0
            h = lid(ip, ua)

            # Extract episode number
            ep_match = re.search(r"/media/(\d+)\.mp3", uri, re.IGNORECASE)
            episode = int(ep_match.group(1)) if ep_match else None

            monthly_listeners[month].add(h)
            monthly_downloads[month] += 1
            monthly_bytes[month] += sc_bytes

            if date_str >= cutoff_30d:
                l30_listeners.add(h)
                l30_downloads += 1
                l30_bytes += sc_bytes
                if episode is not None:
                    l30_ep_listeners[episode].add(h)
                    l30_ep_downloads[episode] += 1

    human = total - bots

    # Print report
    print(f"\n{'=' * 72}")
    print(f"  PODCAST AWS EN FRANÇAIS — AUDIENCE STATISTICS")
    print(f"{'=' * 72}")

    print(f"\n  Processing summary:")
    print(f"    Total MP3 requests:   {total:>12,}")
    print(f"    Bot traffic filtered: {bots:>12,}  ({bots/total*100:.1f}%)")
    print(f"    Human downloads:      {human:>12,}")

    print(f"\n{'─' * 72}")
    print(f"  MONTHLY OVERVIEW")
    print(f"{'─' * 72}")
    print(f"  {'Month':<10} {'Unique Listeners':>18} {'Downloads':>12} {'Data Served':>14}")
    print(f"  {'─'*10} {'─'*18} {'─'*12} {'─'*14}")

    all_listeners = set()
    all_downloads = 0
    all_bytes = 0

    for month in sorted(monthly_listeners.keys()):
        nl = len(monthly_listeners[month])
        nd = monthly_downloads[month]
        nb = monthly_bytes[month]
        all_listeners.update(monthly_listeners[month])
        all_downloads += nd
        all_bytes += nb
        print(f"  {month:<10} {nl:>18,} {nd:>12,} {format_bytes(nb):>14}")

    print(f"  {'─'*10} {'─'*18} {'─'*12} {'─'*14}")
    print(f"  {'TOTAL':<10} {len(all_listeners):>18,} {all_downloads:>12,} {format_bytes(all_bytes):>14}")

    print(f"\n{'─' * 72}")
    print(f"  LAST 30 DAYS  ({cutoff_30d} → {today})")
    print(f"{'─' * 72}")
    print(f"  Unique listeners: {len(l30_listeners):>10,}")
    print(f"  Total downloads:  {l30_downloads:>10,}")
    print(f"  Data served:      {format_bytes(l30_bytes):>10}")

    if l30_ep_downloads:
        print(f"\n  Top 20 episodes (last 30 days, by downloads):")
        print(f"  {'Episode':>8} {'Downloads':>12} {'Unique Listeners':>18}")
        print(f"  {'─'*8} {'─'*12} {'─'*18}")
        sorted_eps = sorted(l30_ep_downloads.items(), key=lambda x: x[1], reverse=True)
        for ep, dl in sorted_eps[:20]:
            ul = len(l30_ep_listeners[ep])
            print(f"  {ep:>8} {dl:>12,} {ul:>18,}")

    print(f"\n{'=' * 72}")
    print(f"  Unique listener = hash(IP + User-Agent). Bot traffic filtered.")
    print(f"{'=' * 72}\n")


if __name__ == "__main__":
    main()
