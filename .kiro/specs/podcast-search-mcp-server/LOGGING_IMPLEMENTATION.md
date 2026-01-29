# Logging Implementation Summary

## Overview

Task 13 (Add logging and monitoring) has been completed. The implementation adds comprehensive structured logging throughout the Podcast Search MCP Server, with JSON-formatted logs compatible with CloudWatch Logs.

## What Was Implemented

### Task 13.1: Configure Structured Logging

Created `src/utils/logging.py` with:

1. **JSONFormatter**: Custom logging formatter that outputs JSON-structured logs
   - Timestamp in ISO 8601 format with timezone
   - Log level (ERROR, WARN, INFO, DEBUG)
   - Component name
   - Message
   - Optional context dictionary
   - Optional execution time in milliseconds
   - Optional error code (for AWS errors)
   - Exception stack traces when present

2. **configure_logging()**: Function to set up structured logging
   - Configurable log level via environment variable
   - JSON formatter for all log output
   - Suppresses noisy third-party loggers (boto3, botocore, urllib3)

3. **get_logger()**: Helper to get component-specific loggers

4. **log_with_context()**: Helper to log with additional structured data

### Task 13.2: Add Error Logging

Added comprehensive logging to all components:

1. **Server Initialization** (`src/server.py`):
   - Server startup and shutdown events
   - Configuration loading
   - Component initialization
   - Initialization failures with full context

2. **AWS Client Manager** (`src/aws/client_manager.py`):
   - Session initialization
   - Credential verification
   - Bedrock client creation
   - AWS API errors with error codes
   - Credential errors with detailed messages

3. **RSS Feed Manager** (`src/rss/feed_manager.py`):
   - Feed fetch attempts with retry count
   - Cache refresh operations
   - Cache age and TTL information
   - Network errors with retry logic

4. **RSS Parser** (`src/rss/parser.py`):
   - Feed parsing operations
   - Parsing warnings (bozo errors)
   - Episode parsing failures
   - Failed episode count tracking

5. **Semantic Search Engine** (`src/search/semantic.py`):
   - Search operations with query
   - Cache hits/misses
   - Bedrock API calls with execution time
   - Bedrock API errors with error codes
   - Result parsing failures

6. **Search Router** (`src/search/router.py`):
   - Query routing decisions
   - Query type detection
   - Search execution with timing
   - Routing failures

7. **Tool Implementations**:
   - `search_episodes.py`: Tool invocations with query and results
   - `get_episode_by_id.py`: Episode lookups with timing
   - `semantic_search.py`: Semantic searches with results

## Log Format

All logs are output as JSON objects to stderr:

```json
{
  "timestamp": "2026-01-22T09:45:33.788892+00:00",
  "level": "INFO",
  "component": "Server",
  "message": "Starting Podcast Search MCP Server initialization"
}
```

With context:
```json
{
  "timestamp": "2026-01-22T09:45:33.789625+00:00",
  "level": "INFO",
  "component": "Server",
  "message": "Configuration loaded",
  "context": {
    "aws_profile": "podcast",
    "aws_region": "eu-central-1",
    "rss_feed_url": "https://francais.podcast.go-aws.com/web/feed.xml",
    "cache_ttl_seconds": 3600
  }
}
```

With execution time:
```json
{
  "timestamp": "2026-01-22T09:45:34.509838+00:00",
  "level": "INFO",
  "component": "SemanticSearchEngine",
  "message": "Bedrock retrieve API call successful",
  "context": {
    "result_count": 5,
    "kb_id": "ABC123"
  },
  "execution_time_ms": 234.56
}
```

With error code (AWS errors):
```json
{
  "timestamp": "2026-01-22T09:45:34.509838+00:00",
  "level": "ERROR",
  "component": "AWSClientManager",
  "message": "AWS credential verification failed",
  "context": {
    "error_code": "InvalidClientTokenId",
    "error_message": "The security token included in the request is invalid"
  },
  "error_code": "InvalidClientTokenId"
}
```

With exception (errors):
```json
{
  "timestamp": "2026-01-22T09:45:34.514018+00:00",
  "level": "ERROR",
  "component": "Server",
  "message": "Failed to initialize server",
  "exception": "Traceback (most recent call last):\n  File ...",
  "context": {
    "error": "Unexpected error during credential verification"
  }
}
```

## Configuration

Logging can be configured via environment variable:

```bash
export LOG_LEVEL=DEBUG  # Options: DEBUG, INFO, WARN, ERROR
```

Default is INFO if not specified.

## CloudWatch Compatibility

The JSON log format is fully compatible with CloudWatch Logs:
- Structured data can be queried using CloudWatch Insights
- Timestamps are in ISO 8601 format
- All fields are properly typed
- Context data is nested for easy filtering

Example CloudWatch Insights query:
```
fields @timestamp, level, component, message, context.query, execution_time_ms
| filter component = "SearchRouter"
| sort @timestamp desc
| limit 100
```

## Requirements Satisfied

### Requirement 8.1: Error Logging
✅ All errors logged with timestamp, context, and stack trace

### Requirement 8.2: AWS API Error Logging
✅ AWS errors logged with error codes and messages

### Requirement 8.3: RSS Parsing Error Logging
✅ RSS parsing errors logged with problematic XML context

### Requirement 8.5: Tool Invocation Logging
✅ All tool invocations logged with parameters and execution time

### Requirement 8.6: Lifecycle Event Logging
✅ Server start/stop events logged

### Requirement 13.6: CloudWatch Compatibility
✅ JSON log format compatible with CloudWatch Logs

## Testing

The logging implementation has been tested and verified:

1. ✅ JSON format validation
2. ✅ All log levels work correctly
3. ✅ Context data is properly structured
4. ✅ Execution time tracking works
5. ✅ Error codes are captured
6. ✅ Stack traces are included in errors
7. ✅ Server initialization logs correctly
8. ✅ Component-specific loggers work

## Next Steps

The logging infrastructure is now in place. Future enhancements could include:

1. Log aggregation to CloudWatch (when deployed to AgentCore)
2. Metrics extraction from logs
3. Alerting based on error patterns
4. Performance monitoring dashboards
5. Log retention policies
