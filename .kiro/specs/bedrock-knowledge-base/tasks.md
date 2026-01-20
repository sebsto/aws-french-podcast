# Implementation Plan: Bedrock Knowledge Base

## Overview

This implementation plan breaks down the Bedrock Knowledge Base feature into discrete, incremental tasks. The approach follows the existing project patterns in `scripts/cdk-processing/` and integrates with the current EventBridge-based workflow.

The implementation is organized into infrastructure setup, document processing logic, integration with existing systems, historical data ingestion, and testing/monitoring.

## Tasks

- [x] 1. Create CDK stack for Bedrock Knowledge Base infrastructure
  - Create new file `lib/podcast-knowledge-base-stack.ts` following existing stack patterns
  - Define Knowledge Base resource with S3 Vectors configuration
  - Configure Titan Embeddings v2 model (1024 dimensions)
  - Set up S3 data source pointing to `kb-documents/` prefix
  - Configure chunking strategy (fixed size, 512 tokens, 50 overlap)
  - Create IAM service role for Knowledge Base with required permissions
  - Add CloudFormation outputs for Knowledge Base ID and ARN
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5_

- [x] 1.1 Write unit tests for CDK stack
  - Test CloudFormation snapshot matches expected structure
  - Test IAM role has correct permissions
  - Test Knowledge Base configuration properties
  - Test S3 data source configuration
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 2. Implement Document Processor Lambda function
  - [x] 2.1 Create Lambda function handler with EventBridge event parsing
    - Create `lambda/document-processor/index.ts`
    - Parse S3 event from EventBridge
    - Extract episode number from S3 key
    - Implement error handling and logging
    - _Requirements: 3.1, 6.1_

  - [x] 2.2 Implement transcription JSON parser
    - Read transcription file from S3
    - Parse JSON structure
    - Extract text from `results.transcripts[0].transcript`
    - Handle malformed JSON with descriptive errors
    - Preserve original text without modification
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 2.3 Write property test for transcription text extraction
    - **Property 1: Transcription Text Extraction Preserves Content**
    - **Validates: Requirements 3.2, 3.5**

  - [x] 2.4 Write property test for malformed transcription handling
    - **Property 2: Malformed Transcription Handling**
    - **Validates: Requirements 3.3**

  - [x] 2.5 Implement RSS feed parser
    - Fetch RSS feed from `https://francais.podcast.go-aws.com/web/feed.xml`
    - Parse XML structure
    - Extract episode metadata (title, description, date, author, guests, links)
    - Implement caching for batch processing
    - Handle missing metadata gracefully with defaults
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [x] 2.6 Write property test for RSS metadata graceful degradation
    - **Property 4: RSS Metadata Graceful Degradation**
    - **Validates: Requirements 4.3, 7.3**

  - [x] 2.7 Write property test for RSS feed caching efficiency
    - **Property 10: RSS Feed Caching Efficiency**
    - **Validates: Requirements 4.6**

  - [x] 2.8 Implement document formatter
    - Combine transcription text with metadata
    - Format document with sections (metadata, transcription, links)
    - Include all required filterable fields (episode, date, author, guests)
    - Generate consistent filename pattern `{episode}.txt`
    - _Requirements: 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 2.9 Write property test for document structure completeness
    - **Property 3: Document Structure Completeness**
    - **Validates: Requirements 4.4, 4.5, 5.1, 5.2, 5.3, 5.4**

  - [x] 2.10 Write property test for S3 document naming consistency
    - **Property 5: S3 Document Naming Consistency**
    - **Validates: Requirements 5.6**

  - [x] 2.11 Implement S3 document writer
    - Write formatted document to `s3://aws-french-podcast-media/kb-documents/`
    - Use consistent naming convention
    - Implement retry logic for transient failures
    - Log successful writes
    - _Requirements: 5.5, 5.6_

  - [x] 2.12 Implement Bedrock ingestion job trigger
    - Call `StartIngestionJob` API after document write
    - Specify data source ID
    - Handle API errors with retries
    - Log ingestion job ID
    - _Requirements: 6.3, 8.1, 8.2_

  - [x] 2.13 Write property test for ingestion job triggering
    - **Property 7: Ingestion Job Triggering**
    - **Validates: Requirements 6.3, 8.1**

  - [x] 2.14 Write unit tests for Lambda function
    - Test with sample transcription JSON (episode 341)
    - Test with sample RSS feed data
    - Test S3 write operations (mocked)
    - Test Bedrock API calls (mocked)
    - Test error scenarios (missing fields, network errors)
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 5.5_

- [x] 3. Add Lambda function to CDK stack
  - Define Lambda function resource in `podcast-knowledge-base-stack.ts`
  - Configure runtime (Node.js 18.x), memory (512 MB), timeout (5 minutes)
  - Create IAM execution role with required permissions
  - Grant S3 read access to `text/*` prefix
  - Grant S3 write access to `kb-documents/*` prefix
  - Grant Bedrock `StartIngestionJob` permission
  - Grant SNS publish permission to alert topic
  - Add CloudWatch Logs permissions
  - _Requirements: 1.5, 6.1, 9.1_

- [x] 4. Integrate with existing EventBridge rule
  - Update `podcast-processor-event-stack.ts`
  - Add Document Processor Lambda as target to `transcriptionCompletionRule`
  - Configure event input mapping
  - Ensure existing content generation workflow continues to work
  - _Requirements: 6.1, 6.2, 10.3_

- [x] 4.1 Write integration test for EventBridge trigger
  - Deploy to test environment
  - Upload test transcription file
  - Verify Lambda is triggered
  - Verify document is written to S3
  - _Requirements: 6.1, 6.2_

- [x] 5. Implement monitoring and alerting
  - [x] 5.1 Create CloudWatch alarms in CDK stack
    - Alarm for Lambda function errors (threshold: 1 in 5 minutes)
    - Alarm for ingestion job failures (threshold: 1 in 15 minutes)
    - Alarm for S3 write errors (threshold: 3 in 5 minutes)
    - _Requirements: 9.2_

  - [x] 5.2 Configure SNS notifications
    - Add alarms to existing `alertTopic`
    - Configure alarm actions for both ALARM and OK states
    - _Requirements: 6.5, 9.3_

  - [x] 5.3 Implement error logging in Lambda
    - Log all errors to CloudWatch with detailed context
    - Include episode number, error type, stack trace
    - Log warnings for missing metadata
    - _Requirements: 9.1_

  - [x] 5.4 Write property test for error logging and alerting
    - **Property 8: Error Logging and Alerting**
    - **Validates: Requirements 6.5, 8.4, 9.1, 9.3**

  - [x] 5.5 Implement ingestion job monitoring
    - Poll ingestion job status after starting
    - Log completion status and metrics
    - Send SNS notification on failure
    - _Requirements: 8.3, 8.4, 8.5, 9.4_

  - [x] 5.6 Write property test for ingestion job monitoring
    - **Property 9: Ingestion Job Monitoring**
    - **Validates: Requirements 8.3, 8.5, 9.4**

- [x] 6. Checkpoint - Deploy and test infrastructure
  - Deploy CDK stack to AWS account 533267385481
  - Verify Knowledge Base created successfully
  - Verify S3 data source configured
  - Verify Lambda function deployed
  - Verify EventBridge integration working
  - Verify CloudWatch alarms created
  - Test with single episode (upload test transcription file)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement historical data ingestion script
  - [x] 7.1 Create migration script `scripts/migrate-historical-episodes.ts`
    - List all transcription files in `s3://aws-french-podcast-media/text/`
    - Filter for files ending with `-transcribe.json`
    - Extract episode numbers from filenames
    - _Requirements: 7.1_

  - [x] 7.2 Implement batch processing logic
    - Fetch RSS feed once and cache
    - Process episodes in batches of 10
    - For each episode: read transcription, extract metadata, format document, write to S3
    - Implement progress reporting (log every 10 episodes)
    - Handle errors gracefully (log and continue)
    - _Requirements: 7.2, 7.3, 7.4, 7.6_

  - [x] 7.3 Write property test for historical ingestion completeness
    - **Property 11: Historical Ingestion Completeness**
    - **Validates: Requirements 7.4**

  - [x] 7.4 Implement ingestion job trigger
    - After all documents processed, trigger full Knowledge Base ingestion
    - Monitor ingestion job status
    - Report completion statistics (total episodes, successes, failures)
    - _Requirements: 7.5, 7.6_

  - [x] 7.5 Write unit tests for migration script
    - Test with subset of episodes (10 episodes)
    - Test progress reporting
    - Test error handling for missing files
    - Test batch processing logic
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Update CDK deployment configuration
  - Update `bin/cdk-infrastructure.ts` to include new stack
  - Configure stack dependencies (depends on IAM and Event stacks)
  - Add stack to deployment order
  - Update README with deployment instructions
  - _Requirements: 10.1_

- [x] 9. Run historical data ingestion
  - Execute migration script with AWS CLI profile `podcast`
  - Monitor progress and logs
  - Verify all 341+ episodes processed
  - Verify ingestion job completes successfully
  - Verify vectors stored in S3 Vectors
  - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [ ] 10. Verify Knowledge Base functionality
  - Test semantic search queries via AWS CLI
  - Query for specific topics (e.g., "AWS Tech Alliance")
  - Verify results include relevant episodes
  - Verify metadata fields are searchable
  - Test filtering by episode number and date
  - _Requirements: 2.4, 2.5_

- [ ]* 11. Write integration tests
  - Deploy to test environment
  - Upload test transcription file
  - Verify EventBridge triggers Lambda
  - Verify document written to S3
  - Verify ingestion job triggered
  - Verify vectors stored in S3 Vectors
  - Query Knowledge Base for test content
  - Verify results match expected content
  - _Requirements: 6.1, 6.3, 8.1_

- [ ]* 12. Write property test for incremental ingestion isolation
  - **Property 6: Incremental Ingestion Isolation**
  - **Validates: Requirements 2.4**

- [ ] 13. Final checkpoint - Production validation
  - Monitor Lambda invocations for 24 hours
  - Monitor ingestion job success rate
  - Check CloudWatch alarms (should be green)
  - Verify SNS notifications working
  - Test Knowledge Base queries with real data
  - Review costs (S3 Vectors, Bedrock API calls)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- All AWS CLI commands must use `--profile podcast --region eu-central-1`
- Follow existing project patterns in `scripts/cdk-processing/`
- Use existing SNS topics (`alertTopic`, `notificationTopic`)
- Reuse existing IAM roles where appropriate
