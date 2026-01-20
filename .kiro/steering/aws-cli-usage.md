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
aws s3 ls s3://aws-french-podcast-media/media/ --profile podcast --region eu-central-1

# Describe Step Functions state machine
aws stepfunctions describe-state-machine --state-machine-arn <arn> --profile podcast --region eu-central-1

# Check CloudWatch logs
aws logs tail /aws/stepfunctions/podcast-transcription --profile podcast --region eu-central-1

# List Lambda functions
aws lambda list-functions --profile podcast --region eu-central-1

# Start transcription job
aws transcribe start-transcription-job --transcription-job-name <name> --profile podcast --region eu-central-1
```

### Incorrect Usage ❌

```bash
# Missing profile and region
aws s3 ls s3://aws-french-podcast-media/media/

# Using MCP tools (DO NOT DO THIS)
mcp_aws_mcp_aws___call_aws

# Using default profile
aws s3 ls s3://aws-french-podcast-media/media/ --region eu-central-1
```

## Why This Matters

1. **Account Isolation**: The `podcast` profile points to a specific AWS account (533267385481)
2. **Region Specificity**: All resources are deployed in `eu-central-1` (Frankfurt)
3. **Permission Boundaries**: The MCP server does not have permissions for this account
4. **Consistency**: Using the same profile/region prevents configuration errors

## Project Configuration

- **AWS Account**: 533267385481
- **AWS Region**: eu-central-1 (Frankfurt)
- **AWS Profile**: podcast
- **S3 Bucket**: aws-french-podcast-media

## Common Commands for This Project

### S3 Operations
```bash
# List media files
aws s3 ls s3://aws-french-podcast-media/media/ --profile podcast --region eu-central-1

# List transcription files
aws s3 ls s3://aws-french-podcast-media/text/ --profile podcast --region eu-central-1

# Copy file to S3
aws s3 cp file.mp3 s3://aws-french-podcast-media/media/ --profile podcast --region eu-central-1
```

### Transcribe Operations
```bash
# List transcription jobs
aws transcribe list-transcription-jobs --profile podcast --region eu-central-1

# Get transcription job details
aws transcribe get-transcription-job --transcription-job-name <name> --profile podcast --region eu-central-1
```

### Step Functions Operations
```bash
# Note: Express state machines don't support list-executions
# Use CloudWatch Logs instead
aws logs tail /aws/stepfunctions/podcast-transcription --profile podcast --region eu-central-1
aws logs tail /aws/stepfunctions/podcast-content-generation --profile podcast --region eu-central-1
```

### Lambda Operations
```bash
# Get Lambda function details
aws lambda get-function --function-name podcast-content-generator --profile podcast --region eu-central-1

# View Lambda logs
aws logs tail /aws/lambda/podcast-content-generator --profile podcast --region eu-central-1
```

### CloudWatch Operations
```bash
# Describe alarms
aws cloudwatch describe-alarms --profile podcast --region eu-central-1

# Get alarm history
aws cloudwatch describe-alarm-history --alarm-name podcast-content-generation-workflow-failures --profile podcast --region eu-central-1
```

## CDK Deployment

All CDK commands also require the profile:

```bash
# Deploy all stacks
npx cdk deploy --all --profile podcast

# Deploy specific stack
npx cdk deploy PodcastProcessorEventStack --profile podcast

# Synthesize templates
npx cdk synth --profile podcast

# Check differences
npx cdk diff --profile podcast
```

## Troubleshooting

If you see "Access Denied" or "Profile not found" errors:

1. Verify the `podcast` profile exists: `aws configure list-profiles`
2. Check profile configuration: `aws configure list --profile podcast`
3. Ensure credentials are valid: `aws sts get-caller-identity --profile podcast`

## Remember

- **Always use `--profile podcast --region eu-central-1`**
- **Never use MCP AWS tools for this project**
- **All resources are in account 533267385481, region eu-central-1**