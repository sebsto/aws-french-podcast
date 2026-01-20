# Bedrock Knowledge Base Ingestion Fix Summary

## Problem

All 241 documents were failing ingestion with the error:
```
Filterable metadata must have at most 2048 bytes (Service: S3Vectors, Status Code: 400)
```

## Root Cause

The S3 vector index was created **without** the required non-filterable metadata keys configured. This caused Bedrock to try storing all text (including large transcription chunks) as filterable metadata, which has a 2 KB limit per vector.

## Solution

Recreated the S3 vector index with proper non-filterable metadata configuration:
- `AMAZON_BEDROCK_TEXT` - Stores large text chunks as non-filterable metadata
- `AMAZON_BEDROCK_METADATA` - Stores Bedrock-managed metadata as non-filterable

Non-filterable metadata can store up to 40 KB total per vector, bypassing the 2 KB filterable limit.

## Changes Made

### 1. Deleted and Recreated Vector Index

**Old index** (created without non-filterable metadata):
```bash
# Created: 2026-01-20T16:55:24+01:00
# Missing: nonFilterableMetadataKeys configuration
```

**New index** (created with proper configuration):
```bash
aws s3vectors create-index \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --index-name podcast-kb-vector-index \
  --data-type float32 \
  --dimension 1024 \
  --distance-metric cosine \
  --metadata-configuration '{
    "nonFilterableMetadataKeys": [
      "AMAZON_BEDROCK_TEXT",
      "AMAZON_BEDROCK_METADATA"
    ]
  }'
```

### 2. Recreated Data Source

**Old data source ID**: `9YPRWWS1LP` (deleted)
**New data source ID**: `CVHXBD68AY` (created)

### 3. Successful Ingestion

**First Ingestion Job ID**: `KJQFPLWKON`
**Status**: COMPLETE
**Results**:
- Documents scanned: 241
- Documents indexed: 241 (episodes 100-340)
- Documents failed: 0
- Duration: ~1 minute 18 seconds

**Second Ingestion Job ID**: `WDW2ZLJLAM`
**Status**: COMPLETE
**Results**:
- Documents scanned: 339
- Documents indexed: 98 (episodes 1-99, excluding episode 65)
- Documents failed: 0
- Duration: ~40 seconds

**Total**: 339 episodes indexed (episodes 1-341, excluding episodes 65 and 213 which don't have transcriptions)

## What Needs to be Updated

### 1. CDK Stack (IMPORTANT!)

The CDK stack in `lib/podcast-knowledge-base-stack.ts` needs to be updated to:

1. **Document the manual vector index creation requirement** with non-filterable metadata keys
2. **Update the data source reference** to use the new data source ID (or remove hardcoded IDs)
3. **Add instructions** for recreating the vector index if it needs to be deleted

The current CDK stack creates the Knowledge Base and data source, but the vector index must be created manually with the proper configuration.

### 2. Environment Variables

The migration script now has default values:
```typescript
const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID || 'OT4JU2FZZF';
const dataSourceId = process.env.DATA_SOURCE_ID || 'CVHXBD68AY';
```

### 3. Lambda Function Environment Variables

The Lambda function environment variables need to be updated in the CDK stack:
```typescript
environment: {
  KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
  DATA_SOURCE_ID: 'CVHXBD68AY',  // Update this!
  ALERT_TOPIC_ARN: props.alertTopic.topicArn
}
```

Or better yet, export the data source ID from the CDK stack and reference it.

## Verification

To verify the Knowledge Base is working:

```bash
# Test a semantic search query
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id OT4JU2FZZF \
  --retrieval-query text="AWS Tech Alliance" \
  --profile podcast --region eu-central-1
```

## Key Learnings

1. **Non-filterable metadata keys MUST be configured during vector index creation**
2. **Non-filterable metadata keys CANNOT be changed after creation** - requires recreating the index
3. **Bedrock automatically uses `AMAZON_BEDROCK_TEXT` and `AMAZON_BEDROCK_METADATA`** when configured
4. **S3 Vectors has two metadata types**:
   - Filterable: Up to 2 KB per vector (for query filters)
   - Non-filterable: Up to 40 KB total per vector (for large text chunks)

## References

- [S3 Vectors Metadata Filtering](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-metadata-filtering.html)
- [Using S3 Vectors with Bedrock Knowledge Bases](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-bedrock-kb.html)
- [Bedrock Knowledge Base Setup Prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-setup.html)
- [S3 Vectors CreateIndex API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_CreateIndex.html)

## Next Steps

1. ✅ Task 9 completed: Historical data ingestion successful
2. ⏭️ Task 10: Verify Knowledge Base functionality with semantic search queries
3. 📝 Update CDK stack documentation with vector index creation requirements
4. 🔄 Redeploy CDK stack with updated data source ID (if needed)
