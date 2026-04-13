#!/bin/bash
# Extract MP3 download records from CloudFront logs
# Output: date \t ip \t user_agent \t uri \t status \t bytes
# Only outputs 200/206 status for .mp3 files

LOGDIR="/tmp/podcast-cf-logs"

for month_dir in "$LOGDIR"/20*/; do
    month=$(basename "$month_dir")
    echo "Processing $month..." >&2
    
    # Use gzcat (macOS) or zcat, pipe through awk for filtering
    find "$month_dir" -name '*.gz' -print0 | \
        xargs -0 -P 4 gzip -dc 2>/dev/null | \
        awk -F'\t' '
        /^#/ { next }
        NF < 33 { next }
        # $8 = uri, $9 = status
        ($9 == "200" || $9 == "206") && tolower($8) ~ /\.mp3$/ {
            print $1 "\t" $5 "\t" $11 "\t" $8 "\t" $9 "\t" $4
        }
        '
done
