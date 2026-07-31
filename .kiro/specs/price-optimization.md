# Cost Optimization Plan — Podcast Hosting

## Current Cost Profile (new account)

| Service | Role | Est. monthly cost |
|---------|------|-------------------|
| CloudFront | MP3 downloads + site | $5-15 (traffic-dependent) |
| S3 storage | 25.7 GB total | ~$0.60 |
| CodePipeline V2 | 1 pipeline | $1.00 |
| CodeBuild ARM | ~8 builds/month | ~$0.50 |
| SNS/ACM/EventBridge | Notifications, cert | ~$0 |
| **Total** | | **~$7-17/month** |

Already saved vs old account: WAF removed (~$5-10/month), processing stacks not deployed (Transcribe/Bedrock/Lambda = $0).

---

## 1. Image Consolidation (your idea)

**Finding:** ~50% of episodes are solo (no guest). Every 3 episodes, 2 are solo "What's New" roundups. Pattern from data: episodes 279-377 show solo every other episode.

**Current:** 6 images uploaded per episode (PNG + WebP × vignette + bannerh + bannerv)

### Recommendations

#### A. Single generic banner for solo episodes

- Create `generic-bannerh.webp` and `generic-bannerv.webp`
- Solo episodes reference these instead of uploading unique ones
- Saves ~4 files/episode × ~26 solo eps/year = 104 fewer uploads

#### B. Drop PNG banners entirely

- Website uses WebP
- Only the square vignette needs PNG (for RSS/podcast apps via `<itunes:image>`)
- **Keep:** `{N}.png`, `{N}.webp`, `{N}-bannerh.webp` (guest only), `{N}-bannerv.webp` (guest only)
- **Drop:** all `*-bannerh.png` and `*-bannerv.png`

#### C. Compress vignettes for web

- Generate a 400px WebP for website display (currently full-size 1000px+)
- Keep full PNG for podcast platforms

**Storage savings:** modest (~200-400 MB cleanup), but the real win is workflow simplification.

---

## 2. S3 Lifecycle Rules

Add to CDK stack:

- `awsfr/media/*` → Standard-IA after 30 days (MP3s are immutable, served via CloudFront cache)
- `awsfr/text/*` → Standard-IA after 7 days (transcriptions rarely re-read)
- `awsfr/kb-documents/*` → Standard-IA after 7 days

**Savings:** ~40% on storage for affected objects → ~$0.20/month. Free money.

---

## 3. CloudFront Cache Behaviors

**Currently:** single default behavior with `CACHING_OPTIMIZED`.

**Recommendation:** Add explicit behaviors for media/img with aggressive caching:

- `/awsfr/media/*`: TTL 1 year (MP3s never change)
- `/awsfr/img/*`: TTL 1 year (images never change)
- Default `/awsfr/*`: TTL 1 hour (site HTML changes on build)

**Savings:** Fewer S3 GET requests, faster loads for returning visitors.

---

## 4. Replace CodePipeline + CodeBuild with Lambda MicroVM

### Current cost

- CodePipeline V2: $1.00/month
- CodeBuild ARM: ~$0.50/month (8 builds × 3-5 min)
- **Total: ~$1.50/month**

### Lambda MicroVM alternative

Lambda MicroVMs are sandboxed Linux environments with snapshot-based fast startup, per-second billing, and no idle costs. Perfect for CI/CD jobs.

### Architecture

```
EventBridge Scheduler (Wed+Fri 4am) ──→ Lambda MicroVM (build + deploy to S3)
GitHub webhook (push to main)        ──→ Lambda MicroVM (build + deploy to S3)
```

Both triggers invoke the same MicroVM image. Keeps the EventBridge scheduler pattern (simpler than GitHub Actions cron which is unreliable/delayed).

### MicroVM image contents

- Node.js + npm
- Toucan binary (pre-installed)
- Pre-cached npm dependencies
- aws-cli (for S3 sync)

### Job flow

1. MicroVM starts from snapshot (~instant)
2. `git clone` the repo (or receive source as input)
3. `npm install && npm run build && npm run copy && npm run dist`
4. `aws s3 sync dist/ s3://podcast-stormacq-net/awsfr/site/ --delete`
5. MicroVM terminates

### Cost estimate (8 builds/month, 5 min each, 2 GB / 1 vCPU)

| Component | Calculation | Monthly cost |
|-----------|-------------|--------------|
| vCPU | 2,400s × 1 vCPU × $0.0000276944 | $0.07 |
| Memory | 2,400s × 2 GB × $0.0000036667 | $0.02 |
| Snapshot read | 8 launches × 2 GB × $0.00155/GB | $0.02 |
| Image storage | 1 image × 2 GB × $0.08/GB-month | $0.16 |
| **Total** | | **~$0.27/month** |

**Savings vs current:** ~$1.23/month (82% cheaper)

### Advantages over GitHub Actions

- Stays fully in AWS — no external dependency
- EventBridge Scheduler integration is native (no cron delay issues)
- Same trigger pattern works for webhook + scheduled builds
- Hardware-isolated, ephemeral, per-second billing
- Pre-baked snapshot = fast startup (no cold install of dependencies)

### Tradeoffs

- Need to build a MicroVM image (one-time effort)
- Need webhook trigger mechanism (API Gateway or Lambda Function URL)
- New service, less community documentation

---

## 5. The Elephant in the Room

CloudFront data transfer for MP3 downloads is 70-80% of the bill. Each episode ~50 MB × listener count. This is irreducible with current architecture.

If the bill ever matters, the nuclear option: **Cloudflare R2 + Workers** (zero egress fees). But that's a full architecture swap, not an optimization.

---

## Priority Matrix

| Action | Effort | Savings | Do it? |
|--------|--------|---------|--------|
| S3 lifecycle rules | 5 min CDK change | $0.20/mo | Yes, now |
| CloudFront cache behaviors | 30 min CDK change | Performance | Yes, now |
| Generic banners for solo eps | 1h workflow change | Workflow simplicity | Yes, next |
| Drop PNG banners | 15 min script change | Storage cleanup | Yes, next |
| GitHub Actions | 2-3h | $1.50/mo | Optional |
| Cloudflare R2 for media | Full rewrite | $5-10/mo | Only if bill matters |
