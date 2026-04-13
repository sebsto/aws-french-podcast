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

for month_dir in $EXTRACT_DIRS; do
  ym=$(basename "$month_dir")
  printf "  Processing %s ..." "$ym" >&2
  find "$month_dir" -name '*.gz' -print0 | xargs -0 -P 4 gzip -dc 2>/dev/null
  echo "done" >&2
done | awk -F'\t' -v outdir="$OUTDIR" '
function urldecode(s) {
    gsub(/%20/, " ", s); gsub(/%28/, "(", s); gsub(/%29/, ")", s)
    gsub(/%2F/, "/", s); gsub(/%2C/, ",", s); gsub(/%2B/, "+", s)
    return s
}
function is_bot(ua,  u) {
    u = tolower(ua)
    if (length(ua) < 10 || ua == "-") return 1
    if (u ~ /bot[^a-z]|crawl|spider|slurp|scraper|fetch|wget/) return 1
    if (u ~ /curl[^a-z]|python-requests|libwww-perl|java\//) return 1
    if (u ~ /httpclient|okhttp|go-http-client/) return 1
    if (u ~ /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot/) return 1
    if (u ~ /facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot/) return 1
    if (u ~ /whatsapp|discordbot|pinterestbot/) return 1
    if (u ~ /feedfetcher|feedvalidator|feedburner|feedly|newsblur/) return 1
    if (u ~ /pingdom|uptimerobot|statuscake|newrelic|datadog/) return 1
    if (u ~ /chartable|podsights|podscribe|podroll|podcorn|podcastindex/) return 1
    if (u ~ /amazoncf|cloudfront|amazonaws/) return 1
    if (u ~ /headlesschrome|phantomjs|selenium|puppeteer/) return 1
    if (u ~ /semrush|ahrefs|mj12bot|dotbot|bytespider/) return 1
    if (u ~ /gptbot|claudebot|anthropic|cohere/) return 1
    if (u ~ /^itms$/) return 1
    return 0
}
function platform(ua,  u) {
    u = tolower(ua)
    if (u ~ /podcasts\/.*cfnetwork.*darwin/) return "apple_podcasts"
    if (u ~ /spotify/) return "spotify"
    if (u ~ /amazonmusic/) return "amazon_music"
    if (u ~ /podcastaddict/) return "podcast_addict"
    if (u ~ /overcast/) return "overcast"
    if (u ~ /deezer/) return "deezer"
    if (u ~ /castbox/) return "castbox"
    if (u ~ /mozilla.*chrome/) return "browser_chrome"
    if (u ~ /mozilla.*firefox/) return "browser_firefox"
    if (u ~ /mozilla.*safari/) return "browser_safari"
    if (u ~ /mozilla/) return "browser_other"
    return "other"
}
/^#/ { next }
NF < 33 { next }
$1 !~ /^20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]$/ { next }
($9 != "200" && $9 != "206") { next }
tolower($8) !~ /\.mp3$/ { next }
{
    date=$1; ip=$5; ua_raw=$11; uri=$8; bytes=$4+0
    ua = urldecode(ua_raw)
    month = substr(date, 1, 7)
    lkey = ip "|" ua_raw

    raw_dl[month]++
    if (is_bot(ua)) { bot_dl[month]++; next }

    ep = ""
    if (match(uri, /\/media\/[0-9]+\.mp3/)) {
        ep = substr(uri, RSTART+7); sub(/\.mp3.*/, "", ep); ep = ep+0
    }
    plat = platform(ua)

    h_dl[month]++; h_bytes[month] += bytes
    if (!(month SUBSEP lkey in m_seen)) { m_seen[month,lkey]=1; h_ul[month]++ }

    day_dl[month,date]++
    if (!(month SUBSEP date SUBSEP lkey in d_seen)) { d_seen[month,date,lkey]=1; day_ul[month,date]++ }
    if (!(month SUBSEP date in d_ex)) { d_ex[month,date]=1; d_list[month]=(d_list[month]==""?date:d_list[month]","date) }

    if (ep != "") {
        ep_dl[month,ep]++
        if (!(month SUBSEP ep SUBSEP lkey in e_seen)) { e_seen[month,ep,lkey]=1; ep_ul[month,ep]++ }
        if (!(month SUBSEP ep in e_ex)) { e_ex[month,ep]=1; e_list[month]=(e_list[month]==""?ep:e_list[month]","ep) }
    }

    p_dl[month,plat]++
    if (!(month SUBSEP plat SUBSEP lkey in p_seen)) { p_seen[month,plat,lkey]=1; p_ul[month,plat]++ }
    if (!(month SUBSEP plat in p_ex)) { p_ex[month,plat]=1; p_list[month]=(p_list[month]==""?plat:p_list[month]","plat) }
}
function ssort(arr, n,  i,j,t) {
    for(i=1;i<=n;i++) for(j=i+1;j<=n;j++) if(arr[i]>arr[j]){ t=arr[i];arr[i]=arr[j];arr[j]=t }
}
END {
    nm=0; for(k in h_dl) { if(k~/^20/) { nm++; mons[nm]=k } }
    ssort(mons, nm)

    for(mi=1; mi<=nm; mi++) {
        m=mons[mi]; f=outdir"/"m".json"
        printf "{\n  \"month\": \"%s\",\n  \"summary\": {\n", m > f
        printf "    \"unique_listeners\": %d,\n    \"downloads\": %d,\n", h_ul[m]+0, h_dl[m]+0 >> f
        printf "    \"bytes_served\": %d,\n    \"raw_requests\": %d,\n    \"bot_requests\": %d\n  },\n", h_bytes[m]+0, raw_dl[m]+0, bot_dl[m]+0 >> f

        printf "  \"daily\": {\n" >> f
        nd=split(d_list[m],days,","); ssort(days,nd)
        for(i=1;i<=nd;i++) { d=days[i]; c=(i<nd)?",":""; printf "    \"%s\": {\"unique_listeners\": %d, \"downloads\": %d}%s\n", d, day_ul[m,d]+0, day_dl[m,d]+0, c >> f }
        printf "  },\n" >> f

        printf "  \"episodes\": [\n" >> f
        delete s_ep; delete s_dl; delete s_ul
        ne=split(e_list[m],raw_eps,",")
        for(i=1;i<=ne;i++) { s_ep[i]=raw_eps[i]; s_dl[i]=ep_dl[m,raw_eps[i]]+0; s_ul[i]=ep_ul[m,raw_eps[i]]+0 }
        for(i=1;i<=ne;i++) for(j=i+1;j<=ne;j++) if(s_dl[i]<s_dl[j]) {
            t=s_ep[i];s_ep[i]=s_ep[j];s_ep[j]=t; t=s_dl[i];s_dl[i]=s_dl[j];s_dl[j]=t; t=s_ul[i];s_ul[i]=s_ul[j];s_ul[j]=t
        }
        lim=(ne<50)?ne:50
        for(i=1;i<=lim;i++) { c=(i<lim)?",":""; printf "    {\"episode\": %s, \"downloads\": %d, \"unique_listeners\": %d}%s\n", s_ep[i], s_dl[i], s_ul[i], c >> f }
        printf "  ],\n" >> f

        printf "  \"platforms\": {\n" >> f
        delete sp_n; delete sp_d; delete sp_u
        np=split(p_list[m],plats,",")
        for(i=1;i<=np;i++) { sp_n[i]=plats[i]; sp_d[i]=p_dl[m,plats[i]]+0; sp_u[i]=p_ul[m,plats[i]]+0 }
        for(i=1;i<=np;i++) for(j=i+1;j<=np;j++) if(sp_d[i]<sp_d[j]) {
            t=sp_n[i];sp_n[i]=sp_n[j];sp_n[j]=t; t=sp_d[i];sp_d[i]=sp_d[j];sp_d[j]=t; t=sp_u[i];sp_u[i]=sp_u[j];sp_u[j]=t
        }
        for(i=1;i<=np;i++) { c=(i<np)?",":""; printf "    \"%s\": {\"downloads\": %d, \"unique_listeners\": %d}%s\n", sp_n[i], sp_d[i], sp_u[i], c >> f }
        printf "  }\n}\n" >> f

        printf "  ✓ %s written\n", m > "/dev/stderr"
    }
}
'


# ── Step 3: Trend report from ALL existing JSON files ─────────────
echo ""
echo "Generating trend report from all monthly files..."

awk -v current="$CURRENT_MONTH" -v cutoff="$CUTOFF_30D" -v today="$TODAY" '
function fmt(b) {
    if(b<1024) return sprintf("%.0f B",b); b/=1024
    if(b<1024) return sprintf("%.1f KB",b); b/=1024
    if(b<1024) return sprintf("%.1f MB",b); b/=1024
    if(b<1024) return sprintf("%.1f GB",b); b/=1024
    return sprintf("%.1f TB",b)
}
function ssort(arr, n,  i,j,t) {
    for(i=1;i<=n;i++) for(j=i+1;j<=n;j++) if(arr[i]>arr[j]){ t=arr[i];arr[i]=arr[j];arr[j]=t }
}
# Parse JSON — simple line-by-line extraction (our JSON is predictable)
FNR==1 { file_idx++ }
/"month":/ { gsub(/[",]/, ""); m=$2; months[file_idx]=m }
/"unique_listeners":/ && in_summary { gsub(/[,]/, ""); ul[m]=$2+0 }
/"downloads":/ && in_summary { gsub(/[,]/, ""); dl[m]=$2+0 }
/"bytes_served":/ { gsub(/[,]/, ""); bytes[m]=$2+0 }
/"raw_requests":/ { gsub(/[,]/, ""); raw[m]=$2+0 }
/"bot_requests":/ { gsub(/[,]/, ""); bots[m]=$2+0 }
/"summary":/ { in_summary=1 }
/"daily":/ { in_summary=0 }
# Platform parsing: inside "platforms" block
/"platforms":/ { in_plat=1; plat_month=m }
/^\s*\}$/ { if(in_plat) in_plat=0 }
in_plat && /"[a-z_]+":.*"downloads"/ {
    line=$0; gsub(/["{},]/, "", line); gsub(/^ +/, "", line)
    pdl=0; pul=0; pname=""
    # line: apple_podcasts: {downloads: 8164 unique_listeners: 922}
    # after cleanup: apple_podcasts: downloads: 8164 unique_listeners: 922
    # platform name is everything before the first ":"
    idx = index(line, ":")
    if (idx > 0) pname = substr(line, 1, idx-1)
    gsub(/ +$/, "", pname)
    n=split(line, toks, " ")
    for(ti=1;ti<=n;ti++) {
        if(toks[ti]=="downloads:") pdl=toks[ti+1]+0
        if(toks[ti]=="unique_listeners:") pul=toks[ti+1]+0
    }
    if(pname != "") {
        plat_dl[plat_month, pname] = pdl
        plat_ul[plat_month, pname] = pul
        if (!(plat_month SUBSEP pname in plat_ex)) {
            plat_ex[plat_month, pname]=1
            plat_list[plat_month]=(plat_list[plat_month]==""?pname:plat_list[plat_month]","pname)
        }
    }
}
END {
    # Collect and sort months
    nm=0
    for(fi=1; fi<=file_idx; fi++) if(months[fi]!="") { nm++; mons[nm]=months[fi] }
    ssort(mons, nm)

    printf "\n========================================================================\n"
    printf "  PODCAST AWS EN FRANÇAIS — AUDIENCE STATISTICS\n"
    printf "========================================================================\n\n"

    # 12-month trend
    start = (nm > 12) ? nm-11 : 1
    printf "  12-MONTH TREND\n"
    printf "  ┌────────────┬────────────────────┬──────────────┬──────────────────┐\n"
    printf "  │   Month    │ Unique Listeners   │  Downloads   │    Trend (UL)    │\n"
    printf "  ├────────────┼────────────────────┼──────────────┼──────────────────┤\n"

    prev=0; sum_ul=0; sum_dl=0; cnt=0; peak_ul=0; peak_m=""; low_ul=999999; low_m=""
    for(i=start; i<=nm; i++) {
        m=mons[i]; u=ul[m]+0; d=dl[m]+0
        partial=(m==current)?" *":"  "
        bar=""; for(b=0;b<int(u/200)&&b<15;b++) bar=bar"█"
        if(prev>0) { pct=(u-prev)/prev*100; trend=(pct>5)?sprintf("▲ +%.0f%%",pct):(pct<-5)?sprintf("▼ %.0f%%",pct):sprintf("  ≈ %+.0f%%",pct) }
        else trend="  —"
        printf "  │ %s%s │ %8s  %-8s │ %12s │ %16s │\n", m, partial, sprintf("%\047d",u), bar, sprintf("%\047d",d), trend
        prev=u
        if(m!=current) { sum_ul+=u; sum_dl+=d; cnt++; if(u>peak_ul){peak_ul=u;peak_m=m}; if(u<low_ul){low_ul=u;low_m=m} }
    }
    printf "  └────────────┴────────────────────┴──────────────┴──────────────────┘\n"
    if(current==mons[nm]) printf "  * Current month (partial data)\n"

    if(cnt>0) {
        printf "\n  Avg unique listeners/month:  %s\n", sprintf("%\047d",int(sum_ul/cnt))
        printf "  Avg downloads/month:         %s\n", sprintf("%\047d",int(sum_dl/cnt))
        printf "  Peak:   %s  (%s listeners)\n", peak_m, sprintf("%\047d",peak_ul)
        printf "  Lowest: %s  (%s listeners)\n", low_m, sprintf("%\047d",low_ul)
    }

    # Platform breakdown (last complete month)
    last_m = (mons[nm]==current && nm>1) ? mons[nm-1] : mons[nm]
    printf "\n  ────────────────────────────────────────────────────────────────────\n"
    printf "  PLATFORM BREAKDOWN (%s)\n", last_m
    printf "  ────────────────────────────────────────────────────────────────────\n"
    np=split(plat_list[last_m],lp,","); tot_pd=0
    delete lpn; delete lpd; delete lpu
    for(i=1;i<=np;i++) { lpn[i]=lp[i]; lpd[i]=plat_dl[last_m,lp[i]]+0; lpu[i]=plat_ul[last_m,lp[i]]+0; tot_pd+=lpd[i] }
    for(i=1;i<=np;i++) for(j=i+1;j<=np;j++) if(lpd[i]<lpd[j]) {
        t=lpn[i];lpn[i]=lpn[j];lpn[j]=t; t=lpd[i];lpd[i]=lpd[j];lpd[j]=t; t=lpu[i];lpu[i]=lpu[j];lpu[j]=t
    }
    printf "  %-20s %10s %8s %10s\n", "Platform", "Downloads", "Share", "Listeners"
    printf "  %-20s %10s %8s %10s\n", "────────────────────", "──────────", "────────", "──────────"
    for(i=1;i<=np;i++) {
        pct=(tot_pd>0)?(lpd[i]/tot_pd*100):0
        printf "  %-20s %10s %6.1f%%  %9s\n", lpn[i], sprintf("%\047d",lpd[i]), pct, sprintf("%\047d",lpu[i])
    }

    printf "\n========================================================================\n"
    printf "  JSON files in: %s/\n", "scripts/podcast-stats/data"
    printf "  Unique listener = unique (IP + User-Agent) combination.\n"
    printf "========================================================================\n\n"
}
' "$OUTDIR"/*.json
