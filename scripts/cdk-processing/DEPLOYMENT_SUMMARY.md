# Bedrock Knowledge Base Deployment Summary

## ✅ Successfully Deployed

The Bedrock Knowledge Base infrastructure has been successfully deployed to AWS account 533267385481 in region eu-central-1.

### Deployment Date
January 20, 2026

### Resources Created

#### 1. S3 Vector Bucket (Manual)
- **Name**: `french-podcast-kb-vectors-533267385481`
- **ARN**: `arn:aws:s3vectors:eu-central-1:533267385481:bucket/french-podcast-kb-vectors-533267385481`
- **Encryption**: SSE-S3 (AES256)
- **Purpose**: Stores vector embeddings for semantic search

#### 2. S3 Vector Index (Manual)
- **Name**: `podcast-kb-vector-index`
- **ARN**: `arn:aws:s3vectors:eu-central-1:533267385481:bucket/french-podcast-kb-vectors-533267385481/index/podcast-kb-vector-index`
- **Dimension**: 1024 (Titan Embeddings v2)
- **Data Type**: float32
- **Distance Metric**: cosine

#### 3. Bedrock Knowledge Base (CDK)
- **ID**: `OT4JU2FZZF`
- **Name**: `podcast-transcription-kb`
- **ARN**: `arn:aws:bedrock:eu-central-1:533267385481:knowledge-base/OT4JU2FZZF`
- **Status**: ACTIVE ✅
- **Embedding Model**: Amazon Titan Embeddings v2 (1024 dimensions)
- **Storage**: S3 Vectors

#### 4. S3 Data Source (CDK)
- **ID**: `9YPRWWS1LP`
- **Name**: `podcast-transcriptions`
- **Source**: `s3://aws-french-podcast-media/kb-documents/`
- **Chunking**: Fixed size, 512 tokens, 10% overlap

#### 5. Document Processor Lambda (CDK)
- **Name**: `podcast-kb-document-processor`
- **ARN**: `arn:aws:lambda:eu-central-1:533267385481:function:podcast-kb-document-processor`
- **Runtime**: Node.js 18.x
- **Memory**: 512 MB
- **Timeout**: 5 minutes
- **Environment Variables**:
  - `KNOWLEDGE_BASE_ID`: OT4JU2FZZF
  - `DATA_SOURCE_ID`: 9YPRWWS1LP
  - `ALERT_TOPIC_ARN`: (SNS topic for alerts)

#### 6. IAM Role for Knowledge Base (CDK)
- **ARN**: `arn:aws:iam::533267385481:role/PodcastKnowledgeBaseStack-KnowledgeBaseServiceRoleC-Nv63yMgwSv6e`
- **Permissions**:
  - Read from `s3://aws-french-podcast-media/kb-documents/`
  - Write vectors to S3 Vectors bucket
  - Invoke Titan Embeddings model

#### 7. CloudWatch Alarms (CDK)
- **podcast-kb-lambda-errors**: Alerts on Lambda function errors (threshold: 1 in 5 min)
- **podcast-kb-s3-write-errors**: Alerts on S3 write failures (threshold: 3 in 5 min)
- **podcast-kb-ingestion-failures**: Alerts on ingestion job failures (threshold: 1 in 15 min)

All alarms are configured to send notifications to the existing SNS alert topic.

## Important Notes

### Manual Setup Required
Due to CloudFormation early validation issues with the new S3 Vectors feature, the vector bucket and index were created manually using AWS CLI. The CDK stack references these manually created resources.

**This is a one-time setup.** Future deployments will reuse the existing vector bucket and index.

### CDK Version
- **aws-cdk-lib**: 2.235.1 (latest as of deployment)

### Cost Estimate
- **S3 Vectors Storage**: ~$0.001/month for 341 episodes
- **Bedrock API Calls**: ~$0.001/month for ongoing ingestion
- **Lambda Executions**: Negligible (pay-per-use)
- **Total**: ~$0.01/month (99.99% cheaper than OpenSearch Serverless)

## Next Steps

### 1. Update EventBridge Integration (Task 4)
The Document Processor Lambda needs to be added as a target to the existing `TranscriptionCompletionRule`:

```bash
cd aws_french_podcast/scripts/cdk-processing
npx cdk deploy PodcastProcessorEventStack --profile podcast
```

This will add the Lambda function as an additional target alongside the existing content generation workflow.

### 2. Test with Single Episode (Task 6 - Testing)
Upload a test transcription file to verify the end-to-end workflow:

```bash
# Upload a test transcription
aws s3 cp test-transcription.json \
  s3://aws-french-podcast-media/text/999-transcribe.json \
  --profile podcast --region eu-central-1

# Monitor Lambda logs
aws logs tail /aws/lambda/podcast-kb-document-processor \
  --follow --profile podcast --region eu-central-1

# Verify document was created
aws s3 ls s3://aws-french-podcast-media/kb-documents/999.txt \
  --profile podcast --region eu-central-1
```

### 3. Run Historical Data Ingestion (Task 7)
Process all 341+ existing episodes:

```bash
cd aws_french_podcast/scripts/cdk-processing
node scripts/migrate-historical-episodes.js --profile podcast --region eu-central-1
```

### 4. Verify Knowledge Base Functionality (Task 10)
Test semantic search queries:

```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id OT4JU2FZZF \
  --retrieval-query text="AWS Tech Alliance" \
  --profile podcast --region eu-central-1
```

## Troubleshooting

### Check Knowledge Base Status
```bash
aws bedrock-agent get-knowledge-base \
  --knowledge-base-id OT4JU2FZZF \
  --profile podcast --region eu-central-1
```

### Check Lambda Function
```bash
aws lambda get-function \
  --function-name podcast-kb-document-processor \
  --profile podcast --region eu-central-1
```

### Check CloudWatch Alarms
```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix podcast-kb \
  --profile podcast --region eu-central-1
```

### View Lambda Logs
```bash
aws logs tail /aws/lambda/podcast-kb-document-processor \
  --follow --profile podcast --region eu-central-1
```

## References

- [BEDROCK_KB_SETUP.md](./BEDROCK_KB_SETUP.md) - Manual setup instructions
- [Design Document](../../.kiro/specs/bedrock-knowledge-base/design.md)
- [Requirements Document](../../.kiro/specs/bedrock-knowledge-base/requirements.md)
- [Tasks List](../../.kiro/specs/bedrock-knowledge-base/tasks.md)

## Stack Outputs

```
PodcastKnowledgeBaseStack.DataSourceId = 9YPRWWS1LP
PodcastKnowledgeBaseStack.DocumentProcessorFunctionArn = arn:aws:lambda:eu-central-1:533267385481:function:podcast-kb-document-processor
PodcastKnowledgeBaseStack.DocumentProcessorFunctionName = podcast-kb-document-processor
PodcastKnowledgeBaseStack.KnowledgeBaseArn = arn:aws:bedrock:eu-central-1:533267385481:knowledge-base/OT4JU2FZZF
PodcastKnowledgeBaseStack.KnowledgeBaseId = OT4JU2FZZF
PodcastKnowledgeBaseStack.KnowledgeBaseRoleArn = arn:aws:iam::533267385481:role/PodcastKnowledgeBaseStack-KnowledgeBaseServiceRoleC-Nv63yMgwSv6e
PodcastKnowledgeBaseStack.VectorBucketName = french-podcast-kb-vectors-533267385481
```
