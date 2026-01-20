# Historical Episode Migration Script

This directory contains the one-time migration script and related files used to perform the initial bulk ingestion of all historical podcast episodes into the Bedrock Knowledge Base.

## Files

- **migrate-historical-episodes.ts** - TypeScript script that processes all historical transcription files and creates Knowledge Base documents
- **create-index-request.json** - JSON configuration used to create the S3 vector index with proper non-filterable metadata keys
- **INGESTION_FIX_SUMMARY.md** - Detailed summary of the ingestion process, issues encountered, and solutions implemented

## Execution Summary

**Date**: January 20, 2026  
**Status**: ✅ Completed Successfully

**Results**:
- Total episodes processed: 339 (episodes 1-341, excluding episodes 65 and 213)
- Documents indexed: 339
- Documents failed: 0
- Total duration: ~2 minutes

## Prerequisites

1. **AWS CLI configured** with `podcast` profile
2. **Knowledge Base deployed** (task 6 complete)
3. **Node.js and TypeScript** installed
4. **Environment variables** set:
   - `AWS_PROFILE=podcast`
   - `KNOWLEDGE_BASE_ID` (from CloudFormation outputs)
   - `DATA_SOURCE_ID` (from CloudFormation outputs)

## Getting Environment Variables

Get the Knowledge Base ID and Data Source ID from CloudFormation:

```bash
aws cloudformation describe-stacks \
  --stack-name PodcastKnowledgeBaseStack \
  --profile podcast \
  --region eu-central-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseId` || OutputKey==`DataSourceId`].[OutputKey,OutputValue]' \
  --output table
```

Example output:
```
---------------------------------
|       DescribeStacks          |
+------------------+------------+
|  KnowledgeBaseId |  OT4JU2FZZF|
|  DataSourceId    |  9YPRWWS1LP|
+------------------+------------+
```

## Usage

**Note**: This script was already executed successfully on January 20, 2026. You typically don't need to run it again unless you need to re-ingest all episodes.

### Quick Start (Using npm scripts)

The easiest way to run the migration:

```bash
cd scripts/bulk-knowledge-base-ingestion

# Install dependencies (first time only)
npm install

# Run the migration
npm run migrate
```

### Available npm Scripts

```bash
# Run the full migration (uses default Knowledge Base and Data Source IDs)
npm run migrate

# Check environment variables and defaults
npm run check-env
```

### Manual Execution

If you need to override the default IDs:

```bash
cd scripts/bulk-knowledge-base-ingestion

KNOWLEDGE_BASE_ID=OT4JU2FZZF \
DATA_SOURCE_ID=CVHXBD68AY \
AWS_PROFILE=podcast \
npx ts-node migrate-historical-episodes.ts
```

**Important**: The script uses default values for `KNOWLEDGE_BASE_ID` (OT4JU2FZZF) and `DATA_SOURCE_ID` (CVHXBD68AY), so you can run it without setting environment variables.

### What the Script Does

1. **Lists transcription files** from `s3://aws-french-podcast-media/text/`
2. **Extracts episode numbers** from filenames (e.g., `341-transcribe.json` → `341`)
3. **Fetches RSS feed** once and caches metadata for all episodes
4. **Processes episodes in batches of 10**:
   - Reads transcription JSON from S3
   - Extracts transcript text
   - Combines with metadata from RSS feed
   - Formats document with all required sections
   - Writes to `s3://aws-french-podcast-media/kb-documents/{episode}.txt`
5. **Reports progress** every batch (10 episodes)
6. **Triggers full Knowledge Base ingestion** after all documents processed
7. **Monitors ingestion job** until completion
8. **Reports final statistics** (total, successful, failed)

## Expected Output

```
================================================================================
Historical Episode Migration Script
================================================================================
AWS Region: eu-central-1
AWS Profile: podcast
S3 Bucket: aws-french-podcast-media
Batch Size: 10
================================================================================

Step 1: Listing transcription files from S3...
Found 340 transcription files

Step 2: Extracting episode numbers...
Extracted 339 episode numbers
Episode range: 1 - 341

Ready to process 339 episodes
Press Ctrl+C to cancel, or the script will continue in 5 seconds...

Step 3: Processing episodes in batches...
Fetching RSS feed...
Cached metadata for 341 episodes

Processing batch 1/34 (episodes 1-10)...
  ✓ Episode 1: Document created
  ✓ Episode 2: Document created
  ...
  Batch 1 complete: 10 successful, 0 failed

Processing batch 2/34 (episodes 11-20)...
  ...

Step 4: Processing complete
Total episodes: 339
Successful: 339
Failed: 0
Skipped: 0

Step 5: Triggering full Knowledge Base ingestion...
Knowledge Base ID: OT4JU2FZZF
Data Source ID: 9YPRWWS1LP
Starting ingestion job (attempt 1/3)...
✓ Ingestion job started: abc123def456

Step 6: Monitoring ingestion job...
Monitoring ingestion job: abc123def456
This may take several minutes...

[2026-01-20T12:00:00.000Z] Status: STARTING
[2026-01-20T12:00:15.000Z] Status: IN_PROGRESS
  Documents scanned: 50
  Documents failed: 0
  Still IN_PROGRESS... (60s elapsed)
  ...
[2026-01-20T12:05:30.000Z] Status: COMPLETE

✓ Ingestion job completed successfully

Completion statistics:
  Documents scanned: 339
  Documents failed: 0
  Total processing time: 330 seconds

================================================================================
Migration script completed successfully
================================================================================
```

## Execution Time

- **Document processing**: ~5-10 minutes (339 episodes)
- **Ingestion job**: ~5-15 minutes (depends on document size)
- **Total**: ~10-25 minutes

## Error Handling

The script handles errors gracefully:

- **Missing transcription files**: Logged and skipped
- **Malformed JSON**: Logged and skipped
- **RSS feed unavailable**: Uses default metadata
- **S3 write failures**: Retries 3 times with exponential backoff
- **Ingestion job failures**: Logged with detailed error messages

Failed episodes are reported at the end with error details.

## Monitoring

### Check Ingestion Job Status Manually

If the script times out or you want to check status later:

```bash
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id OT4JU2FZZF \
  --data-source-id 9YPRWWS1LP \
  --ingestion-job-id <JOB_ID> \
  --profile podcast \
  --region eu-central-1
```

### View Lambda Logs

The Document Processor Lambda also processes new episodes automatically:

```bash
aws logs tail /aws/lambda/podcast-kb-document-processor \
  --follow \
  --profile podcast \
  --region eu-central-1
```

### List Processed Documents

Verify documents were written to S3:

```bash
aws s3 ls s3://aws-french-podcast-media/kb-documents/ \
  --profile podcast \
  --region eu-central-1 \
  | head -20
```

Count total documents in S3:

```bash
aws s3 ls s3://aws-french-podcast-media/kb-documents/ \
  --profile podcast \
  --region eu-central-1 \
  | wc -l
```

### Check Documents in Knowledge Base

Verify documents are indexed in the Knowledge Base by querying for a specific episode:

```bash
# Test retrieval with a known episode topic
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id OT4JU2FZZF \
  --retrieval-query text="episode 341" \
  --profile podcast \
  --region eu-central-1
```

Check the most recent ingestion job status:

```bash
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id OT4JU2FZZF \
  --data-source-id 9YPRWWS1LP \
  --max-results 5 \
  --profile podcast \
  --region eu-central-1 \
  --query 'ingestionJobSummaries[*].[ingestionJobId,status,startedAt,statistics]' \
  --output table
```

### Verify Vector Store

Check if documents are in the vector store by performing a semantic search:

```bash
# Search for a specific topic across all episodes
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id OT4JU2FZZF \
  --retrieval-query text="serverless architecture" \
  --retrieval-configuration 'vectorSearchConfiguration={numberOfResults=10}' \
  --profile podcast \
  --region eu-central-1 \
  --query 'retrievalResults[*].[score,content.text,location.s3Location.uri]' \
  --output table
```

Expected output should show:
- **Score**: Relevance score (0.0 to 1.0)
- **Content**: Text snippet from matching episodes
- **Location**: S3 URI of the source document

If no results are returned, the documents may not be indexed yet. Wait for the ingestion job to complete and check its status.

## Troubleshooting

### Error: Missing required environment variables

Make sure you set `KNOWLEDGE_BASE_ID` and `DATA_SOURCE_ID`:

```bash
export KNOWLEDGE_BASE_ID=OT4JU2FZZF
export DATA_SOURCE_ID=9YPRWWS1LP
export AWS_PROFILE=podcast
```

### Error: Access Denied

Verify your AWS credentials:

```bash
aws sts get-caller-identity --profile podcast
```

### Ingestion Job Failed

Check CloudWatch Logs for the Knowledge Base:

```bash
aws logs tail /aws/bedrock/knowledge-bases/podcast-transcription-kb \
  --follow \
  --profile podcast \
  --region eu-central-1
```

### Some Episodes Failed

The script will continue processing even if some episodes fail. Check the final report for failed episodes and their error messages. You can manually investigate and reprocess failed episodes.

## Re-running the Script

The script is **idempotent** - you can run it multiple times safely:

- Existing documents in S3 will be overwritten with the same content
- The ingestion job will reprocess all documents
- No duplicate vectors will be created

## Next Steps

After successful migration:

1. **Verify Knowledge Base** works by querying it
2. **Test semantic search** with sample queries
3. **Monitor costs** in AWS Cost Explorer
4. **Set up alerts** for ingestion failures (already configured in CDK)

## Testing Queries

Test the Knowledge Base with a sample query:

```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id OT4JU2FZZF \
  --retrieval-query text="AWS Tech Alliance" \
  --profile podcast \
  --region eu-central-1
```

This should return relevant episodes that mention AWS Tech Alliance.
