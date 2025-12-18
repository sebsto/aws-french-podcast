# Requirements Document

## Introduction

The Podcast Episode Processor is a serverless workflow system that automatically processes podcast episodes uploaded to S3. The system transcribes audio files, generates content using AI, and delivers the results via email. The workflow is designed to be simple, maintainable, and leverage AWS managed services with minimal custom code.

## Glossary

- **Episode_Processor**: The complete serverless workflow system for processing podcast episodes
- **Audio_File**: MP3 files containing podcast episode recordings
- **Transcription_Service**: AWS service that converts audio to text (Amazon Transcribe or Whisper)
- **Content_Generator**: AI service that creates titles, descriptions, and social media content (Amazon Bedrock)
- **Notification_Service**: Email delivery system using Amazon SNS
- **Workflow_Orchestrator**: AWS Step Functions managing the processing pipeline
- **Storage_Bucket**: S3 bucket where podcast episodes are uploaded

## Requirements

### Requirement 1

**User Story:** As a podcast producer, I want to upload an MP3 file to S3 and automatically trigger the processing workflow, so that I can initiate episode processing without manual intervention.

#### Acceptance Criteria

1. WHEN an MP3 file is uploaded to the designated S3 bucket, THE Episode_Processor SHALL automatically start the processing workflow
2. WHEN the file upload event occurs, THE Episode_Processor SHALL validate that the uploaded file is an MP3 format
3. WHEN an invalid file format is uploaded, THE Episode_Processor SHALL log the error and terminate processing gracefully
4. WHEN the workflow starts, THE Episode_Processor SHALL create a unique processing identifier for tracking

### Requirement 2

**User Story:** As a podcast producer, I want my audio files to be automatically transcribed, so that I can get text content for further processing.

#### Acceptance Criteria

1. WHEN the transcription step begins, THE Transcription_Service SHALL process the MP3 file and generate a text transcript
2. WHEN transcription completes successfully, THE Episode_Processor SHALL store the transcript in a structured format
3. WHEN transcription fails, THE Episode_Processor SHALL retry the operation up to three times before failing
4. WHEN the transcript is generated, THE Episode_Processor SHALL validate that the transcript contains readable text content

### Requirement 3

**User Story:** As a podcast producer, I want AI to generate episode titles, descriptions, and social media content based on the transcript, so that I can get content suggestions without manual writing.

#### Acceptance Criteria

1. WHEN the transcript is available, THE Content_Generator SHALL create episode descriptions using the specified French prompt
2. WHEN generating content, THE Content_Generator SHALL produce two to three suggested episode titles
3. WHEN creating social media content, THE Content_Generator SHALL generate one LinkedIn version and one Twitter version (maximum 200 characters)
4. WHEN content generation completes, THE Episode_Processor SHALL structure the output with clear sections for titles, descriptions, and social media posts
5. WHEN content generation fails, THE Episode_Processor SHALL retry the operation up to two times before proceeding with error notification

### Requirement 4

**User Story:** As a podcast producer, I want to receive the generated content via email, so that I can review and use the AI-generated suggestions.

#### Acceptance Criteria

1. WHEN all content generation completes successfully, THE Notification_Service SHALL send an email to stormacq@amazon.com
2. WHEN composing the email, THE Episode_Processor SHALL include the original filename, transcript, suggested titles, episode description, and social media content
3. WHEN sending notifications, THE Episode_Processor SHALL format the email content in a readable structure with clear sections
4. WHEN the workflow encounters errors, THE Notification_Service SHALL send an error notification email with details about the failure

### Requirement 5

**User Story:** As a system administrator, I want the workflow to be orchestrated by AWS Step Functions, so that I can have reliable, scalable, and maintainable pipeline execution.

#### Acceptance Criteria

1. WHEN designing the workflow, THE Workflow_Orchestrator SHALL use AWS Step Functions to coordinate all processing steps
2. WHEN possible, THE Episode_Processor SHALL call AWS services directly without intermediate Lambda functions
3. WHEN the workflow executes, THE Workflow_Orchestrator SHALL maintain state and handle retries for transient failures
4. WHEN workflow steps complete, THE Workflow_Orchestrator SHALL pass necessary data between steps using the Step Functions state machine
5. WHEN errors occur, THE Workflow_Orchestrator SHALL implement appropriate error handling and cleanup procedures

### Requirement 6

**User Story:** As a developer, I want the system to be simple and maintainable, so that I can easily evolve and troubleshoot the pipeline.

#### Acceptance Criteria

1. WHEN implementing the system, THE Episode_Processor SHALL minimize custom code and leverage AWS managed services
2. WHEN creating infrastructure, THE Episode_Processor SHALL use Infrastructure as Code for reproducible deployments
3. WHEN logging events, THE Episode_Processor SHALL provide sufficient information for troubleshooting without excessive verbosity
4. WHEN designing components, THE Episode_Processor SHALL follow single responsibility principles for each workflow step