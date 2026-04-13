#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Podcast AWS en Français — Audience Statistics
#
# Extracts MP3 downloads from CloudFront logs, filters bots,
# generates per-month JSON files, prints trend.
#
# By default, only (re)processes current + previous month.
# Existing JSON files for older months are kept as-is.
#
# Usage:
#   ./podcast-stats.sh              # current + previous month
#   ./podcast-stats.sh --all        # reprocess all months
#   ./podcast-stats.sh --months 6   # reprocess last 6 months
#   ./podcast-stats.sh --download   # sync logs from S3 first
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

LOGDIR="/tmp/podcast-cf-logs"
OUTDIR="scripts/podcast-stats/data"
S3_BUCKET="s3://aws-podcasts-cloudfront-logs/PodcastEnFrancais/"
PROCESS_MONTHS=2  # default: current + previous
DO_DOWNLOAD=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --download) DO_DOWNLOAD=1; shift ;;
    --all)      PROCESS_MONTHS=0; shift ;;
    --months)   PROCESS_MONTHS="$2"; shift 2 ;;
    *)          echo "Unknown option: $1"; exit 1 ;;
  esac
done

CURRENT_MONTH=$(date +%Y-%m)
CUTOFF_30D=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
TODAY=$(date +%Y-%m-%d)

# ── Step 0: Optional S3 download ──────────────────────────────────
if [[ -n "$DO_DOWNLOAD" ]]; then
  echo "Syncing logs from S3..."
  mkdir -p "$LOGDIR"
  aws s3 sync "$S3_BUCKET" "$LOGDIR" \
    --profile podcast --region eu-central-1 --quiet
  echo "Organizing files by month..."
  for f in "$LOGDIR"/*.gz; do
    [ -f "$f" ] || continue
    ym=$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}' | head -1)
    [ -n "$ym" ] && mkdir -p "$LOGDIR/$ym" && mv "$f" "$LOGDIR/$ym/"
  done
fi

# ── Step 1: Determine which months to (re)process ─────────────────
mkdir -p "$OUTDIR"
ALL_MONTH_DIRS=$(ls -d "$LOGDIR"/20*/ 2>/dev/null | sort)

if [[ "$PROCESS_MONTHS" -eq 0 ]]; then
  EXTRACT_DIRS="$ALL_MONTH_DIRS"
else
  EXTRACT_DIRS=$(echo "$ALL_MONTH_DIRS" | tail -"$PROCESS_MONTHS")
fi

# Which months are we extracting?
EXTRACT_LIST=""
for d in $EXTRACT_DIRS; do EXTRACT_LIST="$EXTRACT_LIST $(basename "$d")"; done
echo "Extracting: $EXTRACT_LIST"
echo ""

# ── Step 2: Extract + filter + aggregate (only selected months) ───
