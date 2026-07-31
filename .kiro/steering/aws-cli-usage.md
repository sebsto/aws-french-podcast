 ---
inclusion: always
---

# AWS CLI Usage for French Podcast Project

## Critical Rule: Use AWS CLI, Not MCP Server

**IMPORTANT**: All AWS operations for this project MUST be performed using the AWS CLI with the correct profile and region. DO NOT use the MCP AWS server tools.

## Required AWS CLI Parameters

Every AWS CLI command for this project must include:

```bash
--profile podcast --region eu-central-1
```

## Examples

### Correct Usage ✅

```bash
# List S3 objects
aws s3 ls s3://podcast-stormacq-net/awsfr/media/ --profile podcast --region eu-central-1

# List images
aws s3 ls s3://podcast-stormacq-net/awsfr/img/ --profile podcast --region eu-central-1

# List transcriptions
aws s3 ls s3://podcast-stormacq-net/awsfr/text/ --profile podcast --region eu-central-1

# Copy file to S3
aws s3 cp file.mp3 s3://podcast-stormacq-net/awsfr/media/ --profile podcast --region eu-central-1
```

### Incorrect Usage ❌

```bash
# Missing profile and region
aws s3 ls s3://podcast-stormacq-net/awsfr/media/

# Using MCP tools (DO NOT DO THIS)
mcp_aws_mcp_aws___call_aws

# Using default profile
aws s3 ls s3://podcast-stormacq-net/awsfr/media/ --region eu-central-1

# Using old bucket name
aws s3 ls s3://aws-french-podcast-media/media/ --profile podcast --region eu-central-1
```

## Why This Matters

1. **Account Isolation**: The `podcast` profile points to the podcast AWS account (226945380156) via SSO
2. **Region Specificity**: All resources are deployed in `eu-central-1` (Frankfurt)
3. **Permission Boundaries**: The MCP server does not have permissions for this account
4. **Consistency**: Using the same profile/region prevents configuration errors

## Project Configuration

- **AWS Account**: 226945380156
- **AWS Region**: eu-central-1 (Frankfurt)
- **AWS Profile**: podcast (SSO via IAM Identity Center)
- **S3 Bucket**: podcast-stormacq-net
- **S3 Prefix**: awsfr/ (all content lives under this prefix)
- **CloudFront Distribution**: d3opuvqnq5rtvu.cloudfront.net (ID: EO6GCHTJJJV6D)
- **Domain**: podcast.stormacq.net

## S3 Bucket Layout

```
podcast-stormacq-net/
└── awsfr/
    ├── site/          # Website HTML (deployed by CodePipeline)
    ├── media/         # MP3 audio files
    ├── img/           # Episode images (PNG, WebP)
    ├── text/          # Transcription JSON files
    └── kb-documents/  # Knowledge base documents (not in active use)
```

## Common Commands for This Project

### S3 Operations
```bash
# List media files
aws s3 ls s3://podcast-stormacq-net/awsfr/media/ --profile podcast --region eu-central-1

# List transcription files
aws s3 ls s3://podcast-stormacq-net/awsfr/text/ --profile podcast --region eu-central-1

# Copy file to S3
aws s3 cp file.mp3 s3://podcast-stormacq-net/awsfr/media/ --profile podcast --region eu-central-1

# Download transcription
aws s3 cp s3://podcast-stormacq-net/awsfr/text/378-transcribe.json /tmp/ --profile podcast --region eu-central-1
```

### CloudFront Operations
```bash
# Invalidate cache after manual deploy
aws cloudfront create-invalidation \
  --distribution-id EO6GCHTJJJV6D \
  --paths "/*" \
  --profile podcast --region us-east-1

# Check invalidation status
aws cloudfront get-invalidation \
  --distribution-id EO6GCHTJJJV6D \
  --id <invalidation-id> \
  --profile podcast --region us-east-1
```

### CDK Deployment

CDK pipeline stack lives in `scripts/cdk-build/pipeline/`:

```bash
# Deploy pipeline stack
cd scripts/cdk-build/pipeline
npx cdk deploy --profile podcast

# Synthesize templates
npx cdk synth --profile podcast

# Check differences
npx cdk diff --profile podcast
```

## SSO Authentication

The `podcast` profile uses AWS SSO (IAM Identity Center). If credentials expire:

```bash
aws sso login --profile podcast
```

This opens a browser for the SSO consent flow.

## Legacy Account (read-only, for reference)

The old account is accessible via `--profile podcast-old` (uses isengardcli):
- **Account**: 533267385481
- **Bucket**: aws-french-podcast-media
- **Domain**: francais.podcast.go-aws.com (301 redirects to new domain)

Only use `podcast-old` for accessing historical data that hasn't been migrated or for managing the redirect infrastructure.

## Remember

- **Always use `--profile podcast --region eu-central-1`**
- **Never use MCP AWS tools for this project**
- **All resources are in account 226945380156, region eu-central-1**
- **S3 paths always include the `awsfr/` prefix**
