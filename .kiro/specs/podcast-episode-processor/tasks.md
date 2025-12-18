# Implementation Plan

- [x] 1. Set up CDK project structure and dependencies
  - ✅ Initialize new CDK TypeScript project for podcast episode processor
  - ✅ Install required CDK libraries (@aws-cdk/aws-stepfunctions, @aws-cdk/aws-events, @aws-cdk/aws-s3, @aws-cdk/aws-sns, @aws-cdk/aws-lambda)
  - ✅ Configure CDK app for eu-central-1 region and account 533267385481
  - ✅ Set up project structure with separate stacks for IAM, EventBridge, and workflows
  - _Requirements: 6.2_

- [x] 2. Create IAM roles and policies with least privilege
  - [x] 2.1 Create Step Functions execution role
    - ✅ Define IAM role for Step Functions state machine execution
    - ✅ Add policies for Transcribe, SNS, S3, and Lambda access (removed Bedrock - now handled by Lambda)
    - ✅ Include CloudWatch Logs and X-Ray permissions for monitoring
    - _Requirements: 5.1, 6.1_
  
  - [x] 2.2 Create Transcribe service role
    - ✅ Define IAM role for Amazon Transcribe service
    - ✅ Add read access to `aws-french-podcast-media/media/*`
    - ✅ Add write access to `aws-french-podcast-media/text/*`
    - _Requirements: 2.1, 6.1_

  - [x] 2.3 Create Lambda execution role (Content Generator)
    - ✅ Define IAM role for Lambda function execution
    - ✅ Add S3 GetObject permissions for `aws-french-podcast-media/text/*`
    - ✅ Add Bedrock InvokeModel permissions for content generation
    - ✅ Include CloudWatch Logs permissions for function logging
    - _Requirements: 3.1, 6.1_
  
  - [ ]* 2.4 Write property test for IAM role permissions
    - **Property 1: File validation and workflow triggering**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 3. Configure S3 bucket EventBridge notifications
  - [x] 3.1 Enable EventBridge notifications on existing S3 bucket
    - ✅ Configure S3 bucket to send events to EventBridge for `media/` prefix
    - ✅ Set up object creation event filtering for MP3 files
    - _Requirements: 1.1, 1.2_
  
  - [x] 3.2 Create EventBridge rule for MP3 upload trigger
    - ✅ Define EventBridge rule to match S3 object creation events for MP3 files
    - ✅ Configure rule to trigger transcription Step Functions state machine
    - ✅ Add event pattern filtering for MP3 files in media/ folder
    - _Requirements: 1.1, 1.4_
  
  - [x] 3.3 Create EventBridge rule for transcription completion trigger
    - ✅ Define EventBridge rule for transcription JSON file creation in text/ folder
    - ✅ Configure rule to trigger content generation Step Functions state machine
    - ✅ Add event pattern filtering for JSON files with proper object creation/put events
    - _Requirements: 3.1, 3.4_
  
  - [ ]* 3.4 Write property test for event triggering
    - **Property 2: Unique execution tracking**
    - **Validates: Requirements 1.4**

- [x] 4. Implement transcription Step Functions workflow (Standard)
  - [x] 4.1 Create transcription workflow structure
    - ✅ Define Standard Step Functions workflow for reliability and auditability
    - ✅ Implement error handling and retry logic with exponential backoff
    - ✅ Configure state data passing for episode number extraction and file paths
    - ✅ Set up 30-minute timeout for large audio file processing
    - _Requirements: 5.1, 5.3, 5.4, 5.5_
  
  - [x] 4.2 Add transcription steps with direct Transcribe integration
    - ✅ Extract basic info from MP3 upload event (bucket, key, filename)
    - ✅ Parse episode number from filename using JSONPath operations
    - ✅ Configure StartTranscriptionJob task with proper parameters and French language
    - ✅ Set up automatic output to S3 text/ folder with episode-based naming
    - ✅ Send "transcription started" notification via SNS
    - ✅ **ARCHITECTURE**: No polling needed - Transcribe automatically saves to S3, triggering next workflow
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 4.3 Write property test for transcription processing
    - **Property 3: Transcription processing**
    - **Validates: Requirements 2.1, 2.2, 2.4**
  
  - [ ]* 4.4 Write property test for retry behavior
    - **Property 4: Retry behavior for failures**
    - **Validates: Requirements 2.3, 3.5**

- [x] 5. Implement content generation Lambda function and workflow (Express)
  - [x] 5.1 Create Lambda function for content generation
    - ✅ **ARCHITECTURE CHANGE**: Use Lambda instead of direct Step Functions Bedrock integration
    - ✅ Implement Node.js 18.x function with 512MB memory and 5-minute timeout
    - ✅ Add S3 client to fetch transcript content directly (handles large 1.5MB files)
    - ✅ Add Bedrock client with Claude 3.5 Sonnet model integration
    - ✅ Embed full transcript text in French podcast producer prompt
    - ✅ Parse and validate JSON response from Bedrock
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 Create content generation workflow (Express)
    - ✅ Define Express Step Functions workflow for cost optimization and speed
    - ✅ Extract episode number and file paths from transcription completion event
    - ✅ Call Lambda function with S3 bucket and transcript key
    - ✅ Parse Lambda response and extract generated content
    - ✅ Set up 5-minute timeout and error-only logging for cost efficiency
    - _Requirements: 3.1, 3.4, 3.5_
  
  - [ ]* 5.3 Write property test for content generation
    - **Property 5: Content generation completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 6. Create SNS topics and comprehensive email notifications
  - [x] 6.1 Set up SNS topics for notifications and alerts
    - ✅ Create SNS topic for podcast processing notifications
    - ✅ Create separate SNS topic for critical system alerts
    - ✅ Subscribe stormacq@amazon.com to both topics
    - ✅ Configure topic policies and permissions
    - _Requirements: 4.1_
  
  - [x] 6.2 Implement comprehensive email formatting logic
    - ✅ Send "transcription started" notification from transcription workflow
    - ✅ Send comprehensive final notification with all generated content
    - ✅ Include original MP3 filename, transcript filename, suggested titles, episode description
    - ✅ Include formatted social media content (LinkedIn and Twitter versions)
    - ✅ Include raw generated content for reference
    - ✅ Format email with clear sections and French content structure
    - _Requirements: 4.2, 4.3_
  
  - [x] 6.3 Add error notification handling and monitoring
    - ✅ Implement CloudWatch alarms for both workflow failures
    - ✅ Configure SNS actions for alarm notifications (both ALARM and OK states)
    - ✅ Set up error handling with retry logic in both workflows
    - ✅ Include error details in CloudWatch Logs for troubleshooting
    - _Requirements: 4.4_
  
  - [ ]* 6.4 Write property test for email notifications
    - **Property 6: Email notification completeness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 7. Implement file naming and dynamic episode number handling
  - [x] 7.1 Implement episode number extraction from filename
    - ✅ Parse episode number from uploaded MP3 filename using JSONPath operations
    - ✅ Extract episode number from transcription filename in content generation workflow
    - ✅ Use episode number for consistent output file naming across workflows
    - ✅ Generate dynamic originalMp3Key path using extracted episode number
    - _Requirements: 1.1, 2.2_
  
  - [x] 7.2 Configure automatic file output management
    - ✅ Transcribe automatically generates files with naming: `{episode-number}-transcribe.json`
    - ✅ Store transcription output in S3 text/ folder structure
    - ✅ **ARCHITECTURE**: No separate content files - all content delivered via email
    - ✅ Maintain file references in workflow state for email notifications
    - _Requirements: 2.2, 3.4_

- [x] 8. Implement comprehensive logging and monitoring
  - [x] 8.1 Configure separate CloudWatch logging for both workflows
    - ✅ Create dedicated log group for transcription workflow: `/aws/stepfunctions/podcast-transcription`
    - ✅ Create dedicated log group for content generation workflow: `/aws/stepfunctions/podcast-content-generation`
    - ✅ Set 3-month retention policy for cost optimization
    - ✅ Configure appropriate log levels: full logging for transcription, error-only for content generation
    - _Requirements: 6.3_
  
  - [x] 8.2 Add comprehensive CloudWatch alarms and alerting
    - ✅ Create separate alarms for transcription and content generation workflow failures
    - ✅ Configure 5-minute evaluation periods with immediate alerting (threshold: 1 failure)
    - ✅ Set up SNS actions for both ALARM and OK states
    - ✅ Include X-Ray tracing permissions for performance monitoring
    - _Requirements: 5.5_
  
  - [ ]* 8.3 Write property test for workflow orchestration
    - **Property 7: Workflow orchestration reliability**
    - **Validates: Requirements 5.3, 5.4, 5.5**
  
  - [ ]* 8.4 Write property test for logging quality
    - **Property 8: Logging quality**
    - **Validates: Requirements 6.3**

- [x] 9. Deploy and test the complete dual-workflow pipeline
  - [x] 9.1 Deploy CDK stacks to target account
    - ✅ Deploy IAM stack with all required roles and policies
    - ✅ Deploy EventBridge stack with S3 event rules for both workflows
    - ✅ Deploy workflow stack with transcription and content generation state machines
    - ✅ Deploy infrastructure using `--profile podcast` to account 533267385481
    - ✅ Verify all resources created correctly in eu-central-1 region
    - _Requirements: 6.2_
  
  - [x] 9.2 Test end-to-end dual-workflow pipeline
    - ✅ Upload test MP3 file (episode 336) to media/ folder
    - ✅ Verify transcription workflow triggers and completes successfully
    - ✅ Verify content generation workflow triggers on transcript file creation
    - ✅ Validate Lambda function processes 1.5MB transcript file successfully
    - ✅ Confirm Bedrock generates appropriate French content (titles, description, social media)
    - ✅ Verify comprehensive email notification with all generated content
    - ✅ Test file overwrite scenarios to ensure both workflows handle updates
    - _Requirements: 1.1, 2.1, 3.1, 4.1_
  
  - [ ]* 9.3 Write integration tests for complete dual-workflow pipeline
    - Create integration tests using AWS SDK mocking for both workflows
    - Test complete pipeline with various input scenarios and file sizes
    - Test error handling and retry scenarios
    - _Requirements: All requirements_

- [x] 10. Final checkpoint - Dual-workflow system operational
  - ✅ Both transcription and content generation workflows deployed and tested
  - ✅ Lambda-based content generation handling large files successfully
  - ✅ End-to-end pipeline processing episodes with comprehensive email notifications
  - ✅ System architecture optimized for cost (Express workflows) and reliability (Standard transcription)
  - ✅ All monitoring and alerting in place with separate log groups