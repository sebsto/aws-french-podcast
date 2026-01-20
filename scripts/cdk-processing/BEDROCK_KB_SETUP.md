# Bedrock Knowledge Base Manual Setup Guide

## Overview

This guide provides instructions for manually creating the S3 Vectors infrastructure required for the Bedrock Knowledge Base. This manual setup is necessary because S3 Vectors support in CloudFormation is still new and has validation issues.

**Note:** This is a ONE-TIME setup. Once created, the CDK will manage all other resources automatically.

## Prerequisites

- AWS CLI configured with the `podcast` profile
- Access to AWS account 533267385481
- Region: eu-central-1

## Step 1: Create S3 Vector Bucket

S3 Vector Buckets are a specialized type of S3 bucket designed for storing vector embeddings. They are NOT regular S3 buckets.

```bash
# Create the vector bucket
aws s3vectors create-vector-bucket \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --encryption-configuration EncryptionType=SSE-S3 \
  --profile podcast \
  --region eu-central-1
```

**Expected Output:**
```json
{
    "VectorBucketArn": "arn:aws:s3vectors:eu-central-1:533267385481:bucket/french-podcast-kb-vectors-533267385481",
    "VectorBucketName": "french-podcast-kb-vectors-533267385481"
}
```

## Step 2: Create Vector Index

The vector index stores and organizes the vector embeddings within the vector bucket.

```bash
# Create the vector index
aws s3vectors create-index \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --index-name podcast-kb-vector-index \
  --dimension 1024 \
  --data-type float32 \
  --distance-metric cosine \
  --profile podcast \
  --region eu-central-1
```

**Configuration Details:**
- **Dimension**: 1024 (matches Amazon Titan Embeddings v2 output)
- **Data Type**: float32 (32-bit floating-point numbers)
- **Distance Metric**: cosine (measures angular similarity between vectors)

**Expected Output:**
```json
{
    "IndexArn": "arn:aws:s3vectors:eu-central-1:533267385481:bucket/french-podcast-kb-vectors-533267385481/index/podcast-kb-vector-index",
    "IndexName": "podcast-kb-vector-index",
    "VectorBucketName": "french-podcast-kb-vectors-533267385481"
}
```

## Step 3: Verify Resources

Verify that both resources were created successfully:

```bash
# List vector buckets
aws s3vectors list-vector-buckets \
  --profile podcast \
  --region eu-central-1

# List indexes in the vector bucket
aws s3vectors list-indexes \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --profile podcast \
  --region eu-central-1

# Get index details
aws s3vectors get-index \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --index-name podcast-kb-vector-index \
  --profile podcast \
  --region eu-central-1
```

## Step 4: Deploy CDK Stack

Once the manual resources are created, deploy the CDK stack which will reference them:

```bash
cd aws_french_podcast/scripts/cdk-processing
npx cdk deploy PodcastKnowledgeBaseStack --profile podcast
```

The CDK stack will:
- Create the Bedrock Knowledge Base referencing your vector bucket and index
- Create the S3 data source pointing to `s3://aws-french-podcast-media/kb-documents/`
- Deploy the Document Processor Lambda function
- Set up CloudWatch alarms and SNS notifications
- Configure EventBridge integration

## Important Notes

### Resource ARNs

Save these ARNs for reference:

- **Vector Bucket ARN**: `arn:aws:s3vectors:eu-central-1:533267385481:bucket/french-podcast-kb-vectors-533267385481`
- **Vector Index ARN**: `arn:aws:s3vectors:eu-central-1:533267385481:bucket/french-podcast-kb-vectors-533267385481/index/podcast-kb-vector-index`

### Immutable Configuration

The following vector index properties CANNOT be changed after creation:
- Index name
- Dimension (1024)
- Distance metric (cosine)
- Data type (float32)

If you need to change any of these, you must create a new vector index.

### Cost Considerations

S3 Vectors pricing (eu-central-1):
- **Storage**: $0.023 per GB-month
- **Vector Operations**: Pay-per-use (very low cost)
- **Estimated Monthly Cost**: ~$0.01 for 341 episodes

This is approximately 99.99% cheaper than OpenSearch Serverless (~$700/month).

### Cleanup (If Needed)

To delete the resources (WARNING: This will delete all vector data):

```bash
# Delete the vector index first
aws s3vectors delete-index \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --index-name podcast-kb-vector-index \
  --profile podcast \
  --region eu-central-1

# Then delete the vector bucket
aws s3vectors delete-vector-bucket \
  --vector-bucket-name french-podcast-kb-vectors-533267385481 \
  --profile podcast \
  --region eu-central-1
```

## Troubleshooting

### Error: "The specified vector bucket could not be found"

This means you're trying to create an index before the vector bucket exists. Ensure Step 1 completed successfully.

### Error: "InvalidParameterValue"

Check that:
- Dimension is between 1 and 4096
- Data type is "float32"
- Distance metric is either "cosine" or "euclidean"

### Error: "AccessDenied"

Ensure your AWS CLI profile has the following permissions:
- `s3vectors:CreateVectorBucket`
- `s3vectors:CreateIndex`
- `s3vectors:ListVectorBuckets`
- `s3vectors:ListIndexes`
- `s3vectors:GetIndex`

## Next Steps

After completing this setup:

1. Deploy the CDK stack (Step 4 above)
2. Verify the Knowledge Base was created successfully
3. Test with a single episode (Task 6 in tasks.md)
4. Run the historical data ingestion script (Task 7 in tasks.md)

## References

- [S3 Vectors Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html)
- [S3 Vectors Regions and Quotas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-regions-quotas.html)
- [Bedrock Knowledge Bases with S3 Vectors](https://aws.amazon.com/blogs/machine-learning/building-cost-effective-rag-applications-with-amazon-bedrock-knowledge-bases-and-amazon-s3-vectors/)
