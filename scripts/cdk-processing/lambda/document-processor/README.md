# Document Processor Lambda Function

This Lambda function processes podcast transcription files and creates formatted documents for the Bedrock Knowledge Base.

## Functionality

1. **EventBridge Event Parsing**: Receives S3 object creation events via EventBridge
2. **Transcription Extraction**: Reads and parses Amazon Transcribe JSON files
3. **Metadata Enrichment**: Fetches episode metadata from the RSS feed
4. **Document Formatting**: Combines transcription and metadata into a structured document
5. **S3 Storage**: Writes formatted documents to the `kb-documents/` prefix
6. **Ingestion Trigger**: Starts a Bedrock Knowledge Base ingestion job

## Environment Variables

- `AWS_REGION`: AWS region (automatically set by Lambda)
- `KNOWLEDGE_BASE_ID`: ID of the Bedrock Knowledge Base
- `DATA_SOURCE_ID`: ID of the Knowledge Base data source

## Input Event Format

```json
{
  "bucket": {
    "name": "aws-french-podcast-media"
  },
  "object": {
    "key": "text/341-transcribe.json"
  }
}
```

## Output Format

```json
{
  "success": true,
  "episodeNumber": 341,
  "documentKey": "kb-documents/341.txt",
  "ingestionJobId": "abc123...",
  "transcriptionKey": "text/341-transcribe.json"
}
```

## Error Handling

- **Retry Logic**: S3 operations and Bedrock API calls retry 3 times with exponential backoff
- **Graceful Degradation**: Uses default metadata if RSS feed is unavailable
- **Validation**: Validates transcription JSON structure and episode number extraction
- **Logging**: Comprehensive CloudWatch logging for debugging

## Document Format

```
Episode: 341
Title: WIT: AWS Tech Alliance
Publication Date: 2026-01-21T04:00:00+01:00
Author: Sébastien Stormacq
Guests: Pierre Tschirhart - Building Education–Industry Partnerships - https://linkedin.com/...
Description: Dans cet épisode...

Transcription:
Bonjour et bienvenue...

Related Links:
- Episode Page: https://francais.podcast.go-aws.com/web/episodes/341/
```

## Dependencies

- `@aws-sdk/client-s3`: S3 operations
- `@aws-sdk/client-bedrock-agent-runtime`: Bedrock Knowledge Base operations

## Testing

See the test files in the parent directory for unit tests and property-based tests.
