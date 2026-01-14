# Podcast Episode Processor CDK Infrastructure

This CDK project defines the infrastructure for the Podcast Episode Processor, a serverless workflow that automatically processes podcast episodes uploaded to S3.

## Architecture

The infrastructure is organized into three separate stacks:

1. **PodcastProcessorIamStack** - IAM roles and policies with least privilege access
2. **PodcastProcessorEventStack** - EventBridge rules for S3 event handling
3. **PodcastProcessorWorkflowStack** - Step Functions state machine and SNS notifications

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
npx cdk deploy --all --profile podcast

# Or deploy individual stacks
npx cdk deploy PodcastProcessorIamStack --profile podcast
npx cdk deploy PodcastProcessorEventStack --profile podcast
npx cdk deploy PodcastProcessorWorkflowStack --profile podcast
```

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

- EventStack depends on IamStack
- WorkflowStack depends on IamStack

## Resources Created

### IAM Stack
- Step Functions execution role with permissions for Transcribe, Bedrock, SNS, and S3
- Transcribe service role with S3 read/write permissions

### Event Stack
- EventBridge rule to capture S3 object creation events for MP3 files in media/ folder

### Workflow Stack
- Step Functions state machine (placeholder definition)
- SNS topic with email subscription to stormacq@amazon.com
- CloudWatch Log Group for Step Functions execution logs

## Next Steps

The current implementation includes placeholder Step Functions definition. The actual workflow definition will be implemented in subsequent tasks.