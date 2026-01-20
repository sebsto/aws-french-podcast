# EventBridge Integration Test

## Overview

This integration test verifies the end-to-end flow of the Bedrock Knowledge Base document processing pipeline:

1. Upload a test transcription file to S3
2. EventBridge detects the file and triggers the Document Processor Lambda
3. Lambda processes the transcription and writes a formatted document to S3
4. Test verifies the document was created correctly

## Prerequisites

### 1. AWS Credentials

Ensure you have AWS credentials configured for the `podcast` profile:

```bash
aws configure --profile podcast
```

Or verify existing credentials:

```bash
aws sts get-caller-identity --profile podcast --region eu-central-1
```

### 2. Deployed Infrastructure

The following infrastructure must be deployed:

- **PodcastKnowledgeBaseStack**: Knowledge Base and Lambda function
- **PodcastProcessorEventStack**: EventBridge rule for transcription completion
- **PodcastProcessorIamStack**: IAM roles and permissions

Deploy all stacks:

```bash
cd aws_french_podcast/scripts/cdk-processing
npm run deploy
```

Or deploy individually:

```bash
npm run deploy:iam
npm run deploy:event
npx cdk deploy PodcastKnowledgeBaseStack --profile podcast
```

### 3. Verify Deployment

Check that the Lambda function exists:

```bash
aws lambda get-function \
  --function-name podcast-kb-document-processor \
  --profile podcast \
  --region eu-central-1
```

Check that the EventBridge rule exists:

```bash
aws events list-rules \
  --name-prefix transcriptionCompletionRule \
  --profile podcast \
  --region eu-central-1
```

## Running the Test

### Run All Tests

```bash
cd aws_french_podcast/scripts/cdk-processing
npm test
```

### Run Only Integration Test

```bash
npm test -- eventbridge-integration.test.ts
```

### Run with Verbose Output

```bash
npm test -- eventbridge-integration.test.ts --verbose
```

## Test Execution Flow

### 1. Setup Phase
- Initializes S3 and Bedrock clients
- Prepares test transcription data

### 2. Test Execution
- **Upload**: Uploads test transcription file to `s3://aws-french-podcast-media/text/999-transcribe.json`
- **Wait**: Waits 30 seconds for EventBridge to trigger Lambda and Lambda to process
- **Verify**: Checks that document was created at `s3://aws-french-podcast-media/kb-documents/999.txt`
- **Validate**: Verifies document content includes all required sections

### 3. Cleanup Phase
- Deletes test transcription file
- Deletes test document file

## Expected Output

### Successful Test Run

```
 PASS  test/eventbridge-integration.test.ts
  EventBridge Integration Test
    End-to-End Integration
      ✓ should trigger Lambda when transcription file is uploaded (30045ms)
      ✓ should verify document naming convention (125ms)
      ✓ should verify document is UTF-8 encoded (98ms)
    Lambda Execution Verification
      ✓ should verify Lambda was triggered by checking CloudWatch Logs (87ms)
    Error Handling
      ✓ should handle missing transcription file gracefully (156ms)
      ✓ should handle malformed transcription JSON (30234ms)
    Performance Verification
      ✓ should process transcription within acceptable time (15678ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

### Failed Test Run

If the test fails, check:

1. **Lambda not triggered**: Check EventBridge rule configuration
2. **Document not created**: Check Lambda execution logs
3. **Permission errors**: Check IAM roles and policies
4. **Timeout errors**: Increase wait time in test

## Troubleshooting

### Test Times Out

If the test times out waiting for the document:

1. Check Lambda execution logs:
```bash
aws logs tail /aws/lambda/podcast-kb-document-processor \
  --follow \
  --profile podcast \
  --region eu-central-1
```

2. Check EventBridge rule targets:
```bash
aws events list-targets-by-rule \
  --rule transcriptionCompletionRule \
  --profile podcast \
  --region eu-central-1
```

### Document Not Created

1. Verify Lambda was triggered:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/podcast-kb-document-processor \
  --filter-pattern "999" \
  --profile podcast \
  --region eu-central-1
```

2. Check for Lambda errors:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/podcast-kb-document-processor \
  --filter-pattern "ERROR" \
  --profile podcast \
  --region eu-central-1
```

### Permission Errors

If you see `AccessDenied` errors:

1. Verify IAM role has S3 permissions:
```bash
aws iam get-role-policy \
  --role-name podcast-kb-document-processor-role \
  --policy-name S3AccessPolicy \
  --profile podcast
```

2. Verify Lambda execution role:
```bash
aws lambda get-function-configuration \
  --function-name podcast-kb-document-processor \
  --profile podcast \
  --region eu-central-1 \
  --query 'Role'
```

### EventBridge Not Triggering

1. Check EventBridge rule is enabled:
```bash
aws events describe-rule \
  --name transcriptionCompletionRule \
  --profile podcast \
  --region eu-central-1
```

2. Verify event pattern matches:
```bash
aws events test-event-pattern \
  --event-pattern file://event-pattern.json \
  --event file://test-event.json \
  --profile podcast \
  --region eu-central-1
```

## Manual Verification

If automated tests fail, you can manually verify the integration:

### 1. Upload Test File

```bash
echo '{"jobName":"episode-999","accountId":"533267385481","results":{"transcripts":[{"transcript":"Test transcription"}],"items":[]},"status":"COMPLETED"}' > test-transcription.json

aws s3 cp test-transcription.json \
  s3://aws-french-podcast-media/text/999-transcribe.json \
  --profile podcast \
  --region eu-central-1
```

### 2. Wait and Check Document

Wait 30 seconds, then:

```bash
aws s3 ls s3://aws-french-podcast-media/kb-documents/999.txt \
  --profile podcast \
  --region eu-central-1
```

### 3. Download and Inspect Document

```bash
aws s3 cp s3://aws-french-podcast-media/kb-documents/999.txt . \
  --profile podcast \
  --region eu-central-1

cat 999.txt
```

### 4. Cleanup

```bash
aws s3 rm s3://aws-french-podcast-media/text/999-transcribe.json \
  --profile podcast \
  --region eu-central-1

aws s3 rm s3://aws-french-podcast-media/kb-documents/999.txt \
  --profile podcast \
  --region eu-central-1
```

## Test Configuration

### Test Episode Number

The test uses episode number `999` to avoid conflicts with real episodes. If episode 999 exists in production, update the test to use a different number:

```typescript
const testEpisodeNumber = 9999; // Change this value
```

### Wait Times

The test waits 30 seconds for Lambda processing. If your Lambda takes longer:

```typescript
await new Promise(resolve => setTimeout(resolve, 60000)); // Increase to 60 seconds
```

### Timeouts

Jest test timeouts are configured per test:

```typescript
test('should trigger Lambda when transcription file is uploaded', async () => {
  // Test code
}, 60000); // 60 second timeout
```

## CI/CD Integration

To run integration tests in CI/CD:

1. **Set up AWS credentials** in CI environment
2. **Deploy infrastructure** to test environment
3. **Run tests** with appropriate timeouts
4. **Cleanup** test resources

Example GitHub Actions workflow:

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: eu-central-1

- name: Run Integration Tests
  run: |
    cd aws_french_podcast/scripts/cdk-processing
    npm test -- eventbridge-integration.test.ts
```

## Notes

- **Test Duration**: Integration tests take 30-90 seconds due to EventBridge and Lambda processing time
- **Test Isolation**: Each test uses unique episode numbers to avoid conflicts
- **Cleanup**: Tests automatically clean up resources in `afterAll` hook
- **Idempotency**: Tests can be run multiple times safely
- **Real AWS Resources**: Tests interact with real AWS services and incur minimal costs

## Requirements Validated

This integration test validates the following requirements:

- **Requirement 6.1**: Lambda is triggered when transcription file is created
- **Requirement 6.2**: System integrates with existing EventBridge rule
- **Requirement 5.5**: Documents are written to S3 data source location
- **Requirement 5.6**: Documents use consistent naming convention
- **Requirement 3.1**: Transcription JSON is parsed correctly
- **Requirement 4.4**: Documents contain all required sections
