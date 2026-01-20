# Podcast Episode Processor CDK Infrastructure

This CDK project defines the infrastructure for the Podcast Episode Processor, a serverless workflow that automatically processes podcast episodes uploaded to S3.

## Architecture

The infrastructure is organized into four separate stacks:

1. **PodcastProcessorIamStack** - IAM roles and policies with least privilege access
2. **PodcastProcessorWorkflowStack** - Step Functions state machines and SNS notifications
3. **PodcastKnowledgeBaseStack** - Bedrock Knowledge Base with S3 Vectors for semantic search
4. **PodcastProcessorEventStack** - EventBridge rules for S3 event handling

## Configuration

- **Target Account**: 533267385481
- **Target Region**: eu-central-1
- **AWS Profile**: podcast (use `--profile podcast` for deployment)
- **Existing S3 Bucket**: aws-french-podcast-media

## Deployment

To deploy the infrastructure:

```bash
# Build the project
npm run build

# Deploy all stacks (use the podcast profile)
npm run deploy

# Or deploy individual stacks in order
npm run deploy:iam
npm run deploy:workflow
npm run deploy:kb
npm run deploy:event

# Alternative: Use CDK directly
npx cdk deploy --all --profile podcast
```

### Deploying the Knowledge Base Stack

The Knowledge Base stack creates:
- Bedrock Knowledge Base with S3 Vectors storage
- S3 data source pointing to kb-documents/ prefix
- Lambda function for document processing
- IAM roles and permissions
- CloudWatch alarms and monitoring

**Prerequisites:**
- Bedrock model access must be enabled for Amazon Titan Embeddings v2
- S3 bucket `aws-french-podcast-media` must exist

**First-time deployment:**
```bash
# Deploy the Knowledge Base stack
npm run deploy:kb

# Or use CDK directly
npx cdk deploy PodcastKnowledgeBaseStack --profile podcast

# Verify the Knowledge Base was created
aws bedrock-agent list-knowledge-bases --profile podcast --region eu-central-1

# Check the Lambda function
aws lambda get-function --function-name podcast-kb-document-processor --profile podcast --region eu-central-1
```

**Post-deployment:**
After deploying the Knowledge Base stack, you need to run the historical data ingestion script to populate the Knowledge Base with existing episodes. See the "Historical Data Ingestion" section below.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch for changes
npm run watch

# Run tests
npm test

# Synthesize CloudFormation templates
npx cdk synth

# Compare deployed stack with current state
npx cdk diff --profile podcast
```

## Stack Dependencies

- WorkflowStack depends on IamStack
- KnowledgeBaseStack depends on WorkflowStack (uses alertTopic)
- EventStack depends on WorkflowStack and KnowledgeBaseStack

The deployment order is:
1. IamStack (base IAM roles)
2. WorkflowStack (Step Functions and SNS topics)
3. KnowledgeBaseStack (Bedrock Knowledge Base and Lambda)
4. EventStack (EventBridge rules connecting everything)

## Resources Created

### IAM Stack
- Step Functions execution role with permissions for Transcribe, Bedrock, SNS, and S3
- Transcribe service role with S3 read/write permissions

### Workflow Stack
- Transcription Step Functions state machine
- Content generation Step Functions state machine
- SNS alert topic for critical failures
- SNS notification topic for workflow completion
- CloudWatch Log Groups for Step Functions execution logs

### Knowledge Base Stack
- Bedrock Knowledge Base with S3 Vectors storage
- S3 data source pointing to kb-documents/ prefix
- Lambda function for document processing (Node.js 18.x, 512 MB, 5 min timeout)
- IAM execution role for Lambda with S3, Bedrock, and SNS permissions
- CloudWatch alarms for Lambda errors, ingestion failures, and S3 write errors
- CloudWatch Log Group for Lambda execution logs

### Event Stack
- EventBridge rule to capture S3 object creation events for MP3 files in media/ folder
- EventBridge rule to capture transcription completion events
- Lambda targets for document processing
- Step Functions targets for transcription and content generation workflows

## Next Steps

The current implementation includes placeholder Step Functions definition. The actual workflow definition will be implemented in subsequent tasks.

## Historical Data Ingestion

After deploying the Knowledge Base stack, you need to ingest all existing podcast episodes (341+) into the Knowledge Base.

### Quick Start

```bash
# Get Knowledge Base and Data Source IDs from CloudFormation
aws cloudformation describe-stacks \
  --stack-name PodcastKnowledgeBaseStack \
  --profile podcast \
  --region eu-central-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseId` || OutputKey==`DataSourceId`].[OutputKey,OutputValue]' \
  --output table

# Run the migration script
cd scripts/cdk-processing

KNOWLEDGE_BASE_ID=<your-kb-id> \
DATA_SOURCE_ID=<your-ds-id> \
AWS_PROFILE=podcast \
npx ts-node migrate-historical-episodes.ts
```

### What It Does

The migration script will:
1. List all transcription files in s3://aws-french-podcast-media/text/
2. Fetch episode metadata from the RSS feed (cached for efficiency)
3. Process episodes in batches of 10
4. Format and write documents to s3://aws-french-podcast-media/kb-documents/
5. Trigger a full Knowledge Base ingestion job
6. Monitor ingestion progress and report completion statistics

**Expected Duration**: 10-25 minutes for 339+ episodes

For detailed instructions, troubleshooting, and monitoring, see [MIGRATION_SCRIPT_README.md](./MIGRATION_SCRIPT_README.md)

## Monitoring and Troubleshooting

### Check Lambda Function Logs
```bash
aws logs tail /aws/lambda/podcast-kb-document-processor --follow --profile podcast --region eu-central-1
```

### Check Knowledge Base Status
```bash
# List Knowledge Bases
aws bedrock-agent list-knowledge-bases --profile podcast --region eu-central-1

# Get Knowledge Base details
aws bedrock-agent get-knowledge-base --knowledge-base-id <kb-id> --profile podcast --region eu-central-1

# List data sources
aws bedrock-agent list-data-sources --knowledge-base-id <kb-id> --profile podcast --region eu-central-1
```

### Check Ingestion Jobs
```bash
# List ingestion jobs
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id <kb-id> \
  --data-source-id <ds-id> \
  --profile podcast --region eu-central-1

# Get ingestion job details
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id <kb-id> \
  --data-source-id <ds-id> \
  --ingestion-job-id <job-id> \
  --profile podcast --region eu-central-1
```

### Check CloudWatch Alarms
```bash
# List all alarms
aws cloudwatch describe-alarms --profile podcast --region eu-central-1

# Get specific alarm
aws cloudwatch describe-alarms \
  --alarm-names podcast-kb-lambda-errors \
  --profile podcast --region eu-central-1
```

### Test Knowledge Base Query
```bash
# Query the Knowledge Base
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id <kb-id> \
  --retrieval-query text="AWS Tech Alliance" \
  --profile podcast --region eu-central-1
```

## Cost Estimation

The Knowledge Base infrastructure has minimal ongoing costs:
- **S3 Vectors Storage**: ~$0.001/month for 341 episodes
- **Bedrock API Calls**: ~$0.001/month for embeddings (4 new episodes/month)
- **Lambda Execution**: Negligible (4 invocations/month)
- **Total Monthly Cost**: ~$0.01

Initial ingestion cost (one-time): ~$0.11