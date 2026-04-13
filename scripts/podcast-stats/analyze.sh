#!/bin/bash
# Fast audience analysis using awk
# Input: /tmp/podcast-mp3-records.tsv (from extract_mp3.sh)
# Filters bots, computes unique listeners and downloads per month + last 30 days

INPUT="/tmp/podcast-mp3-records.tsv"
CUTOFF_30D=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
TODAY=$(date +%Y-%m-%d)

echo "Analyzing $(wc -l < "$INPUT" | tr -d ' ') MP3 download records..."
echo "Bot filtering + audience computation..."
echo ""

awk -F'\t' -v cutoff="$CUTOFF_30D" -v today="$TODAY" '
function urldecode(s,   i, c, h) {
    gsub(/%20/, " ", s)
    gsub(/%28/, "(", s)
    gsub(/%29/, ")", s)
    gsub(/%2F/, "/", s)
    gsub(/%2C/, ",", s)
    gsub(/%3B/, ";", s)
    gsub(/%2B/, "+", s)
    return s
}

function is_bot(ua) {
    ua_lower = tolower(ua)
    if (length(ua) < 10) return 1
    if (ua == "-") return 1
    if (ua_lower ~ /bot[^a-z]|crawl|spider|slurp|scraper|fetch|wget/) return 1
    if (ua_lower ~ /curl[^a-z]|python-requests|libwww-perl|java\//) return 1
    if (ua_lower ~ /httpclient|okhttp|go-http-client/) return 1
    if (ua_lower ~ /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot/) return 1
    if (ua_lower ~ /facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot/) return 1
    if (ua_lower ~ /whatsapp|discordbot|pinterestbot/) return 1
    if (ua_lower ~ /feedfetcher|feedvalidator|feedburner|feedly|newsblur/) return 1
    if (ua_lower ~ /pingdom|uptimerobot|statuscake|newrelic|datadog/) return 1
    if (ua_lower ~ /chartable|podsights|podscribe|podroll|podcorn/) return 1
    if (ua_lower ~ /podcastindex|castbox/) return 1
    if (ua_lower ~ /amazoncf|cloudfront|amazonaws/) return 1
    if (ua_lower ~ /headlesschrome|phantomjs|selenium|puppeteer/) return 1
    if (ua_lower ~ /semrush|ahrefs|mj12bot|dotbot|bytespider/) return 1
    if (ua_lower ~ /gptbot|claudebot|anthropic|cohere/) return 1
    if (ua == "iTMS") return 1
    if (ua_lower ~ /^itms$/) return 1
    return 0
}

{
    date = $1
    ip = $2
    ua_raw = $3
    uri = $4
    status = $5
    bytes = $6 + 0

    # Validate date format YYYY-MM-DD
    if (date !~ /^20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]$/) next

    total++

    ua = urldecode(ua_raw)

    if (is_bot(ua)) {
        bots++
        next
    }

    # Listener hash: ip|ua (we use the combo as key directly)
    listener_key = ip "|" ua_raw

    month = substr(date, 1, 7)

    # Extract episode number from /media/NNN.mp3
    ep = ""
    if (match(uri, /\/media\/[0-9]+\.mp3/)) {
        tmp = substr(uri, RSTART + 7)  # skip "/media/"
        sub(/\.mp3.*/, "", tmp)
        ep = tmp
    }

    # Monthly stats
    monthly_dl[month]++
    monthly_bytes[month] += bytes
    if (!(month SUBSEP listener_key in monthly_seen)) {
        monthly_seen[month, listener_key] = 1
        monthly_ul[month]++
    }

    # Last 30 days
    if (date >= cutoff) {
        l30_dl++
        l30_bytes += bytes
        if (!(listener_key in l30_seen)) {
            l30_seen[listener_key] = 1
            l30_ul++
        }
        if (ep != "") {
            l30_ep_dl[ep]++
            if (!(ep SUBSEP listener_key in l30_ep_seen)) {
                l30_ep_seen[ep, listener_key] = 1
                l30_ep_ul[ep]++
            }
        }
    }
}

function fmt_bytes(b) {
    if (b < 1024) return sprintf("%.0f B", b)
    b /= 1024
    if (b < 1024) return sprintf("%.1f KB", b)
    b /= 1024
    if (b < 1024) return sprintf("%.1f MB", b)
    b /= 1024
    if (b < 1024) return sprintf("%.1f GB", b)
    b /= 1024
    return sprintf("%.1f TB", b)
}

END {
    human = total - bots

    print ""
    print "========================================================================"
    print "  PODCAST AWS EN FRANÇAIS — AUDIENCE STATISTICS"
    print "========================================================================"
    print ""
    printf "  Processing summary:\n"
    printf "    Total MP3 requests:   %12s\n", sprintf("%'\''d", total)
    printf "    Bot traffic filtered: %12s  (%.1f%%)\n", sprintf("%'\''d", bots), (bots/total)*100
    printf "    Human downloads:      %12s\n", sprintf("%'\''d", human)

    print ""
    print "------------------------------------------------------------------------"
    print "  MONTHLY OVERVIEW"
    print "------------------------------------------------------------------------"
    printf "  %-10s %18s %12s %14s\n", "Month", "Unique Listeners", "Downloads", "Data Served"
    printf "  %-10s %18s %12s %14s\n", "----------", "------------------", "------------", "--------------"

    # Sort months
    n_months = 0
    for (m in monthly_dl) {
        months[++n_months] = m
    }
    # Simple bubble sort
    for (i = 1; i <= n_months; i++) {
        for (j = i + 1; j <= n_months; j++) {
            if (months[i] > months[j]) {
                tmp = months[i]
                months[i] = months[j]
                months[j] = tmp
            }
        }
    }

    total_ul_keys_count = 0
    total_dl = 0
    total_b = 0
    for (i = 1; i <= n_months; i++) {
        m = months[i]
        printf "  %-10s %18s %12s %14s\n", m, sprintf("%'\''d", monthly_ul[m]), sprintf("%'\''d", monthly_dl[m]), fmt_bytes(monthly_bytes[m])
        total_dl += monthly_dl[m]
        total_b += monthly_bytes[m]
    }
    printf "  %-10s %18s %12s %14s\n", "----------", "------------------", "------------", "--------------"
    printf "  %-10s %18s %12s %14s\n", "TOTAL", "-", sprintf("%'\''d", total_dl), fmt_bytes(total_b)

    print ""
    print "------------------------------------------------------------------------"
    printf "  LAST 30 DAYS  (%s → %s)\n", cutoff, today
    print "------------------------------------------------------------------------"
    printf "  Unique listeners: %10s\n", sprintf("%'\''d", l30_ul)
    printf "  Total downloads:  %10s\n", sprintf("%'\''d", l30_dl)
    printf "  Data served:      %10s\n", fmt_bytes(l30_bytes)

    # Top episodes last 30 days - collect and sort
    n_eps = 0
    for (ep in l30_ep_dl) {
        n_eps++
        ep_list[n_eps] = ep
        ep_dl_list[n_eps] = l30_ep_dl[ep]
    }
    # Sort by downloads descending
    for (i = 1; i <= n_eps; i++) {
        for (j = i + 1; j <= n_eps; j++) {
            if (ep_dl_list[i] < ep_dl_list[j]) {
                tmp = ep_list[i]; ep_list[i] = ep_list[j]; ep_list[j] = tmp
                tmp = ep_dl_list[i]; ep_dl_list[i] = ep_dl_list[j]; ep_dl_list[j] = tmp
            }
        }
    }

    if (n_eps > 0) {
        print ""
        print "  Top 20 episodes (last 30 days, by downloads):"
        printf "  %8s %12s %18s\n", "Episode", "Downloads", "Unique Listeners"
        printf "  %8s %12s %18s\n", "--------", "------------", "------------------"
        limit = (n_eps < 20) ? n_eps : 20
        for (i = 1; i <= limit; i++) {
            ep = ep_list[i]
            printf "  %8s %12s %18s\n", ep, sprintf("%'\''d", l30_ep_dl[ep]), sprintf("%'\''d", l30_ep_ul[ep])
        }
    }

    print ""
    print "========================================================================"
    print "  Unique listener = unique (IP + User-Agent) combination."
    print "  Bot traffic filtered using known bot/crawler patterns."
    print "========================================================================"
    print ""
}
' "$INPUT"
