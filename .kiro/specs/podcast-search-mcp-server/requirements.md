# Requirements Document: Podcast Search MCP Server

## Introduction

This document specifies the requirements for a Model Context Protocol (MCP) server that enables intelligent search capabilities for the AWS French Podcast. The server provides both deterministic searches (using RSS feed data) and semantic searches (using Amazon Bedrock Knowledge Base) to help users discover podcast episodes through various query methods.

The MCP server will be built using the Strands Agents framework and will run locally as an stdio server, using local AWS credentials to access the Bedrock Knowledge Base and S3 resources.

## Glossary

- **MCP_Server**: The Model Context Protocol server that exposes search tools to AI agents
- **RSS_Feed**: The XML feed containing structured podcast episode metadata at https://francais.podcast.go-aws.com/web/feed.xml
- **Bedrock_Knowledge_Base**: Amazon Bedrock service containing vectorized episode transcriptions for semantic search
- **Stdio_Server**: A server that communicates via standard input/output streams rather than HTTP
- **Strands_Framework**: The Strands Agents framework used to build the MCP server
- **Episode_Metadata**: Structured data about episodes including ID, title, description, publication date, guests, and links
- **Semantic_Search**: Natural language content-based search using vector embeddings
- **Deterministic_Search**: Exact match searches on structured metadata fields
- **AWS_Profile**: The AWS credential profile name passed as a parameter to the MCP server (e.g., "podcast") with access to eu-central-1 region

## Requirements

### Requirement 1: MCP Server Initialization

**User Story:** As a developer, I want the MCP server to initialize properly using the Strands framework, so that it can communicate with AI agents via stdio protocol.

#### Acceptance Criteria

1. WHEN the MCP server starts, THE MCP_Server SHALL initialize using the Strands Agents framework
2. WHEN initialization occurs, THE MCP_Server SHALL establish stdio communication channels for input and output
3. WHEN the server is ready, THE MCP_Server SHALL register all available search tools with the MCP protocol
4. WHEN initialization fails, THE MCP_Server SHALL log descriptive error messages and exit gracefully
5. THE MCP_Server SHALL accept an AWS profile name as a configuration parameter
6. WHEN an AWS profile parameter is provided, THE MCP_Server SHALL load credentials from that profile for region eu-central-1

### Requirement 2: RSS Feed Data Management

**User Story:** As a system component, I want to fetch and cache RSS feed data, so that deterministic searches can be performed efficiently without repeated network calls.

#### Acceptance Criteria

1. WHEN the server starts, THE MCP_Server SHALL fetch the RSS feed from https://francais.podcast.go-aws.com/web/feed.xml
2. WHEN the RSS feed is fetched, THE MCP_Server SHALL parse the XML into structured Episode_Metadata objects
3. WHEN parsing occurs, THE MCP_Server SHALL extract episode ID, title, description, publication date, duration, guests, and links
4. WHEN the feed is successfully parsed, THE MCP_Server SHALL cache the Episode_Metadata in memory
5. IF the RSS feed fetch fails, THEN THE MCP_Server SHALL log the error and retry with exponential backoff up to 3 attempts
6. WHEN the cache is older than 1 hour, THE MCP_Server SHALL refresh the RSS feed data

### Requirement 3: Episode Search by ID

**User Story:** As an AI agent, I want to retrieve a specific episode by its ID number, so that I can provide detailed information about that episode.

#### Acceptance Criteria

1. WHEN a get_episode_by_id tool is invoked with a valid episode ID, THE MCP_Server SHALL return the complete Episode_Metadata for that episode
2. WHEN the episode ID is not found, THE MCP_Server SHALL return an error message indicating the episode does not exist
3. WHEN the episode ID is invalid (non-numeric or negative), THE MCP_Server SHALL return a validation error
4. THE MCP_Server SHALL search the cached RSS feed data for the episode ID
5. WHEN an episode is found, THE MCP_Server SHALL return all available metadata fields including title, description, date, guests, and links

### Requirement 4: Date Range Search

**User Story:** As an AI agent, I want to find episodes published within a specific date range, so that I can help users discover content from particular time periods.

#### Acceptance Criteria

1. WHEN a search_by_date_range tool is invoked with start and end dates, THE MCP_Server SHALL return all episodes published within that range
2. WHEN the start date is after the end date, THE MCP_Server SHALL return a validation error
3. WHEN date formats are invalid, THE MCP_Server SHALL return a descriptive error message
4. THE MCP_Server SHALL accept dates in ISO 8601 format (YYYY-MM-DD)
5. WHEN no episodes match the date range, THE MCP_Server SHALL return an empty result set with a message
6. WHEN episodes are found, THE MCP_Server SHALL return them sorted by publication date in descending order

### Requirement 5: Guest Search

**User Story:** As an AI agent, I want to find episodes featuring specific guests, so that I can help users discover content by their favorite speakers.

#### Acceptance Criteria

1. WHEN a search_by_guest tool is invoked with a guest name, THE MCP_Server SHALL return all episodes featuring that guest
2. WHEN searching for guests, THE MCP_Server SHALL perform case-insensitive partial matching on guest names
3. WHEN no episodes match the guest name, THE MCP_Server SHALL return an empty result set with a message
4. WHEN multiple episodes are found, THE MCP_Server SHALL return them sorted by publication date in descending order
5. THE MCP_Server SHALL search across all guest name fields in the Episode_Metadata

### Requirement 6: Semantic Search Integration

**User Story:** As an AI agent, I want to perform natural language searches across episode content, so that I can help users find episodes by topic or subject matter.

#### Acceptance Criteria

1. WHEN a semantic_search tool is invoked with a natural language query, THE MCP_Server SHALL query the Bedrock_Knowledge_Base
2. WHEN querying Bedrock, THE MCP_Server SHALL use the AWS "podcast" profile credentials for authentication
3. WHEN querying Bedrock, THE MCP_Server SHALL target the eu-central-1 region
4. WHEN search results are returned, THE MCP_Server SHALL include relevance scores for each result
5. WHEN no results are found, THE MCP_Server SHALL return an empty result set with a message
6. THE MCP_Server SHALL return a maximum of 10 results per semantic search query
7. WHEN Bedrock API calls fail, THE MCP_Server SHALL return a descriptive error message

### Requirement 7: Combined Search Tool

**User Story:** As an AI agent, I want a unified search interface that automatically routes to the appropriate search backend, so that I can use a single tool for all search types.

#### Acceptance Criteria

1. WHEN a search_episodes tool is invoked, THE MCP_Server SHALL analyze the query to determine the appropriate search method
2. WHEN the query contains an episode ID pattern, THE MCP_Server SHALL route to episode ID search
3. WHEN the query contains date patterns or ranges, THE MCP_Server SHALL route to date range search
4. WHEN the query contains guest name indicators, THE MCP_Server SHALL route to guest search
5. WHEN the query is natural language without specific patterns, THE MCP_Server SHALL route to semantic search
6. WHEN multiple search methods could apply, THE MCP_Server SHALL prioritize deterministic searches over semantic searches
7. THE MCP_Server SHALL return results in a consistent format regardless of the backend used

### Requirement 8: Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can diagnose issues and monitor server health.

#### Acceptance Criteria

1. WHEN any error occurs, THE MCP_Server SHALL log the error with timestamp, context, and stack trace
2. WHEN AWS API calls fail, THE MCP_Server SHALL log the AWS error code and message
3. WHEN RSS feed parsing fails, THE MCP_Server SHALL log the parsing error and the problematic XML section
4. WHEN tool invocations fail, THE MCP_Server SHALL return structured error responses to the calling agent
5. THE MCP_Server SHALL log all tool invocations with parameters and execution time
6. WHEN the server starts or stops, THE MCP_Server SHALL log lifecycle events

### Requirement 9: Tool Response Format

**User Story:** As an AI agent, I want search results in a consistent, structured format, so that I can easily parse and present information to users.

#### Acceptance Criteria

1. WHEN any search tool returns results, THE MCP_Server SHALL format responses as JSON objects
2. WHEN returning episode data, THE MCP_Server SHALL include episode ID, title, description, publication date, duration, and URL
3. WHEN guest information is available, THE MCP_Server SHALL include guest names, titles, and LinkedIn links
4. WHEN related links are available, THE MCP_Server SHALL include link text and URLs
5. WHEN semantic search returns results, THE MCP_Server SHALL include relevance scores
6. WHEN errors occur, THE MCP_Server SHALL return error objects with error type, message, and suggested actions

### Requirement 10: AWS Authentication and Authorization

**User Story:** As a system component, I want to authenticate with AWS services using configurable credentials, so that I can access the Bedrock Knowledge Base and S3 resources with the appropriate profile.

#### Acceptance Criteria

1. WHEN the server initializes, THE MCP_Server SHALL accept an AWS profile name as a configuration parameter
2. WHEN an AWS profile parameter is provided, THE MCP_Server SHALL load AWS credentials from that profile
3. WHEN credentials are loaded, THE MCP_Server SHALL verify access to the eu-central-1 region
4. IF no profile parameter is provided, THEN THE MCP_Server SHALL use the default AWS credential chain
5. IF credentials are missing or invalid, THEN THE MCP_Server SHALL log an error and fail to start
6. WHEN making Bedrock API calls, THE MCP_Server SHALL use the loaded credentials
7. THE MCP_Server SHALL handle AWS credential expiration by logging an error and returning appropriate error responses

### Requirement 11: Performance and Caching

**User Story:** As a developer, I want efficient caching and performance optimization, so that search operations respond quickly without excessive API calls.

#### Acceptance Criteria

1. WHEN RSS feed data is cached, THE MCP_Server SHALL serve deterministic searches from cache without network calls
2. WHEN the cache is stale (older than 1 hour), THE MCP_Server SHALL refresh it asynchronously
3. WHEN multiple identical semantic searches occur within 5 minutes, THE MCP_Server SHALL cache and reuse Bedrock results
4. THE MCP_Server SHALL respond to deterministic searches within 100 milliseconds
5. THE MCP_Server SHALL respond to semantic searches within 2 seconds (excluding Bedrock API latency)

### Requirement 12: Tool Registration and Discovery

**User Story:** As an AI agent, I want to discover available search tools and their parameters, so that I can use them correctly.

#### Acceptance Criteria

1. WHEN an agent queries available tools, THE MCP_Server SHALL return a list of all registered search tools
2. WHEN tool information is requested, THE MCP_Server SHALL provide tool names, descriptions, and parameter schemas
3. THE MCP_Server SHALL register the following tools: search_episodes, get_episode_by_id, search_by_date_range, search_by_guest, semantic_search
4. WHEN parameter schemas are provided, THE MCP_Server SHALL specify required vs optional parameters, data types, and validation rules
5. THE MCP_Server SHALL include usage examples in tool descriptions

### Requirement 13: Future AgentCore Deployment Compatibility

**User Story:** As a developer, I want the MCP server architecture to support future deployment to Amazon Bedrock AgentCore, so that I can migrate from stdio to HTTP transport without rewriting core functionality.

#### Acceptance Criteria

1. THE MCP_Server SHALL separate transport layer logic from business logic
2. THE MCP_Server SHALL implement all search functionality in transport-agnostic modules
3. THE MCP_Server SHALL NOT use stdio-specific features that cannot be adapted to HTTP transport
4. THE MCP_Server SHALL structure AWS credential handling to support both local profiles (stdio) and IAM roles (AgentCore)
5. THE MCP_Server SHALL avoid hardcoding localhost URLs or file system paths that assume local execution
6. THE MCP_Server SHALL implement logging and error handling compatible with CloudWatch Logs
7. WHEN the server initializes, THE MCP_Server SHALL load configuration from environment variables or parameters rather than hardcoded values

### Requirement 14: Code Organization and Maintainability

**User Story:** As a developer, I want the codebase to be well-organized with minimal lines of code per file, so that the code is easy to understand, maintain, and extend.

#### Acceptance Criteria

1. THE MCP_Server SHALL organize all source code in a `src/` directory
2. THE MCP_Server SHALL split code into small, focused modules grouped by functional scope
3. WHEN any single module exceeds 300 lines of code, THE MCP_Server SHALL refactor it into smaller modules
4. THE MCP_Server SHALL organize modules into the following functional groups:
   - Core server initialization and tool registration
   - RSS feed management and caching
   - Search engines (deterministic and semantic)
   - Query routing and analysis
   - AWS client management
   - Data models and types
   - Utility functions
5. THE MCP_Server SHALL maintain a clear module hierarchy with minimal circular dependencies
6. THE MCP_Server SHALL use relative imports that work correctly from the `src/` directory
7. THE MCP_Server SHALL ensure the virtual environment (venv) continues to work after code reorganization
8. THE MCP_Server SHALL remove unnecessary test files and temporary debugging scripts from the project root
9. THE MCP_Server SHALL keep only essential files in the project root: main entry point, README, requirements.txt, configuration files
10. WHEN modules are split, THE MCP_Server SHALL ensure each module has a single, well-defined responsibility
