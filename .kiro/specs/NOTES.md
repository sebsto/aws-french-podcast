CertificateArn: arn:aws:acm:us-east-1:226945380156:certificate/5d92b935-2b40-462e-8b9a-77810f56b2f9

ConnectionArn: arn:aws:codestar-connections:eu-central-1:226945380156:connection/ab8ad8c1-3e3c-4bae-a728-9d50230fc736

PAEFPipelineStack.BucketName = podcast-stormacq-net
PAEFPipelineStack.DistributionDomainName = d3opuvqnq5rtvu.cloudfront.net
CloudFront Distribution ID: EO6GCHTJJJV6D
Stack ARN:
arn:aws:cloudformation:eu-central-1:226945380156:stack/PAEFPipelineStack/2c100170-8c1e-11f1-8aaa-0a03cbf577cf

---

## Migration Progress — 30 July 2026

### What was done today

1. **AWS CLI profiles**: renamed `podcast` → `podcast-old` (533267385481), created new `podcast` via SSO (226945380156)
2. **CDK bootstrap**: both eu-central-1 and us-east-1 on new account
3. **ACM certificate**: `podcast.stormacq.net` issued in us-east-1
4. **CodeStar connection**: GitHub `sebsto/aws-french-podcast` connected and AVAILABLE
5. **CDK pipeline stack deployed**: S3 bucket `podcast-stormacq-net`, CodePipeline, CloudFront (`d3opuvqnq5rtvu.cloudfront.net`), CF Function for URL rewriting. No WAF, no scheduler.
6. **Toucan config updated** (local, NOT pushed): `toucan.yml`, `site.yml`, `rss.mustache`, `upload_episode.sh`
7. **Historical data migrated**: all media (384), images (808), transcripts (382), KB docs (375) copied to new bucket under `awsfr/` prefix
8. **DNS configured**: `podcast.stormacq.net` CNAME → `d3opuvqnq5rtvu.cloudfront.net`
9. **Site verified working**: homepage, feed.xml, episodes, media, images all return 200

### Current state

- New site is live at `https://podcast.stormacq.net/awsfr/` but serves a stale build (old URLs in HTML) because the code changes haven't been pushed to `main` yet
- Old site at `francais.podcast.go-aws.com` is **untouched** and fully operational
- Friday scheduler on old account will trigger the pipeline and publish episode 378 (or whatever is next) as usual
- Code changes are local only (not committed/pushed)

### What to do AFTER Friday's episode publishes

In order:

✅ 1. ~~**Manually deploy correct build to new site** (to fix broken images now):~~ Done
   ```bash
   make prod
   aws s3 sync dist/ s3://podcast-stormacq-net/awsfr/site/ --profile podcast --region eu-central-1 --delete
   aws cloudfront create-invalidation --distribution-id EO6GCHTJJJV6D --paths "/*" --profile podcast --region us-east-1
   ```

2. **Disable old pipeline** (after confirming episode is live on all platforms):
   ```bash
   aws codepipeline disable-stage-transition \
     --pipeline-name FrenchPodcastPipeline \
     --stage-name Source \
     --transition-type Inbound \
     --reason "Migration to new account" \
     --profile podcast-old --region eu-central-1
   ```

3. **Push code to `main`**:
   ```bash
   git add -A && git commit -m "Migrate to personal AWS account (podcast.stormacq.net)" && git push
   ```
   This triggers the new pipeline which rebuilds with correct URLs.

4. **Update op3.dev** (https://op3.dev/show/d8347e02-cf46-566b-924b-468b4d848aee):
   - Change feed URL to `https://podcast.stormacq.net/awsfr/feed.xml`

5. **Update Podtrac** (publisher.podtrac.com):
   - Update authorized domain to `podcast.stormacq.net`

6. **Update podcast platforms** (Apple, Spotify, YouTube, Amazon Music, Deezer):
   - New feed URL: `https://podcast.stormacq.net/awsfr/feed.xml`

7. **Deploy 301 redirect on old account** (Task 12 in the plan):
   - CloudFront Function on `francais.podcast.go-aws.com` → 301 to `podcast.stormacq.net`

8. **Update steering files** (`.kiro/steering/`) to reference new account, bucket, domain

### Important notes

- Do NOT push to `main` before disabling the old pipeline — it would deploy new-URL code to the old bucket and break `francais.podcast.go-aws.com`
- The `podcast-old` profile uses `isengardcli` — make sure midway auth is valid before running commands against old account
- After the flip, the old site can keep running as redirect-only (no content changes needed)