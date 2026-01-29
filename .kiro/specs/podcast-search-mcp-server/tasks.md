# Implementation Plan: Podcast Search MCP Server

## Overview

This implementation plan breaks down the Podcast Search MCP Server into discrete, incremental coding tasks. The server will be built using Python with the FastMCP framework, providing five search tools for AI agents to discover podcast episodes through both deterministic (RSS feed) and semantic (Bedrock Knowledge Base) searches.

The implementation follows a bottom-up approach: core data models → data managers → search engines → tool implementations → integration and testing.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Create project directory structure
  - Create `requirements.txt` with fastmcp, boto3, feedparser, python-dateutil
  - Create `podcast_search_server.py` as main entry point
  - Set up Python virtual environment
  - _Requirements: 1.1, 1.5, 1.6_

- [x] 2. Implement core data models
  - [x] 2.1 Create Episode, Guest, and Link dataclasses
    - Define Episode dataclass with all metadata fields
    - Define Guest dataclass with name, title, linkedin_url
    - Define Link dataclass with text and url
    - Add `to_dict()` methods for JSON serialization
    - _Requirements: 2.3, 9.2, 9.3, 9.4_
  
  - [x] 2.2 Write property test for Episode data model
    - **Property 22: Episode Response Completeness**
    - **Validates: Requirements 9.2, 9.3, 9.4**
  
  - [x] 2.3 Create ServerConfig dataclass
    - Define configuration parameters (aws_profile, aws_region, rss_feed_url, etc.)
    - Add validation for required fields
    - Add method to load from environment variables
    - _Requirements: 1.5, 1.6, 10.1, 10.2, 13.7_

- [x] 3. Implement AWS Client Manager
  - [x] 3.1 Create AWSClientManager class
    - Initialize with profile and region parameters
    - Implement credential loading (profile or default chain)
    - Implement `get_bedrock_client()` method
    - Implement `verify_credentials()` using STS GetCallerIdentity
    - Handle credential errors gracefully
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 13.4_
  
  - [x] 3.2 Write unit tests for AWS Client Manager
    - Test credential loading with valid profile
    - Test fallback to default credential chain
    - Test credential verification
    - Test error handling for invalid credentials
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 4. Checkpoint - Verify AWS authentication works
  - Ensure AWS Client Manager can authenticate with podcast profile
  - Verify Bedrock client can be created
  - Ask the user if questions arise

- [-] 5. Implement RSS Feed Manager
  - [x] 5.1 Create RSSFeedManager class with caching
    - Initialize with feed URL and cache TTL
    - Implement `fetch_and_parse()` with feedparser
    - Implement in-memory cache with timestamp
    - Implement `get_cached_episodes()` with automatic refresh
    - Add exponential backoff retry logic (3 attempts)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 11.2_
  
  - [x] 5.2 Write property test for RSS feed parsing
    - **Property 1: RSS Feed Parsing Completeness**
    - **Validates: Requirements 2.2, 2.3**
  
  - [x] 5.3 Write property test for caching round trip
    - **Property 2: RSS Feed Caching Round Trip**
    - **Validates: Requirements 2.4**
  
  - [x] 5.4 Implement search_by_id method
    - Search cached episodes by episode ID
    - Return Episode object or None
    - _Requirements: 3.1, 3.4_
  
  - [x] 5.5 Write property tests for episode ID search
    - **Property 3: Episode ID Search Completeness**
    - **Validates: Requirements 3.1, 3.5**
    - **Property 4: Episode ID Not Found Error**
    - **Validates: Requirements 3.2**
    - **Property 5: Episode ID Validation**
    - **Validates: Requirements 3.3**
  
  - [x] 5.6 Implement search_by_date_range method
    - Parse start and end dates
    - Filter episodes by publication date
    - Sort results by date descending
    - _Requirements: 4.1, 4.6_
  
  - [x] 5.7 Write property tests for date range search
    - **Property 6: Date Range Search Inclusivity**
    - **Validates: Requirements 4.1**
    - **Property 7: Date Range Validation**
    - **Validates: Requirements 4.2**
    - **Property 8: Date Format Validation**
    - **Validates: Requirements 4.3, 4.4**
    - **Property 10: Result Sorting by Date**
    - **Validates: Requirements 4.6, 5.4**
  
  - [x] 5.8 Implement search_by_guest method
    - Perform case-insensitive partial matching on guest names
    - Search across all guest fields
    - Sort results by date descending
    - _Requirements: 5.1, 5.2, 5.4_
  
  - [x] 5.9 Write property tests for guest search
    - **Property 11: Guest Search Case Insensitivity**
    - **Validates: Requirements 5.1, 5.2**
    - **Property 12: Guest Search Partial Matching**
    - **Validates: Requirements 5.2**

- [x] 6. Checkpoint - Verify RSS feed operations work
  - Test RSS feed fetching and parsing with real feed
  - Verify all search methods return correct results
  - Verify caching works correctly
  - Ask the user if questions arise

- [-] 7. Implement Semantic Search Engine
  - [x] 7.1 Create SemanticSearchEngine class
    - Initialize with AWS client, KB ID, and max results
    - Implement `search()` method using Bedrock Agent Runtime
    - Call `retrieve` API on Knowledge Base
    - Parse results and extract episode information
    - Add result caching (5 minute TTL)
    - _Requirements: 6.1, 6.2, 6.3, 6.6_
  
  - [x] 7.2 Create SemanticResult dataclass
    - Define fields: episode_id, title, excerpt, relevance_score, metadata
    - Add `to_dict()` method for JSON serialization
    - _Requirements: 6.4, 9.5_
  
  - [x] 7.3 Write property tests for semantic search
    - **Property 13: Semantic Search Result Limit**
    - **Validates: Requirements 6.6**
    - **Property 14: Semantic Search Relevance Scores**
    - **Validates: Requirements 6.4, 9.5**
  
  - [x] 7.4 Write unit tests for semantic search error handling
    - Test Bedrock API failure handling
    - Test empty result handling
    - Test result enrichment with RSS metadata
    - _Requirements: 6.5, 6.7_

- [x] 8. Implement Search Router
  - [x] 8.1 Create SearchRouter class
    - Initialize with RSS manager and semantic engine
    - Implement `_detect_query_type()` with pattern matching
    - Implement `route_query()` to dispatch to appropriate engine
    - Implement priority logic (deterministic over semantic)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  
  - [x] 8.2 Write property tests for query routing
    - **Property 15: Query Routing by Episode ID Pattern**
    - **Validates: Requirements 7.2**
    - **Property 16: Query Routing by Date Pattern**
    - **Validates: Requirements 7.3**
    - **Property 17: Query Routing by Guest Indicator**
    - **Validates: Requirements 7.4**
    - **Property 18: Query Routing Default to Semantic**
    - **Validates: Requirements 7.5**
    - **Property 19: Deterministic Search Priority**
    - **Validates: Requirements 7.6**

- [x] 9. Implement MCP tools with FastMCP
  - [x] 9.1 Initialize FastMCP server and components
    - Create FastMCP instance with server name
    - Load ServerConfig from environment variables
    - Initialize RSSFeedManager, AWSClientManager, SemanticSearchEngine, SearchRouter
    - _Requirements: 1.1, 1.3, 1.5, 1.6_
  
  - [x] 9.2 Implement get_episode_by_id tool
    - Add @mcp.tool() decorator
    - Validate episode_id parameter
    - Call RSS manager search_by_id
    - Format response as JSON (success or error)
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [x] 9.3 Implement search_by_date_range tool
    - Add @mcp.tool() decorator
    - Validate date parameters (ISO 8601 format)
    - Validate start_date <= end_date
    - Call RSS manager search_by_date_range
    - Format response as JSON with sorted results
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 9.4 Implement search_by_guest tool
    - Add @mcp.tool() decorator
    - Call RSS manager search_by_guest
    - Format response as JSON with sorted results
    - Include informative message for empty results
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 9.5 Implement semantic_search tool
    - Add @mcp.tool() decorator with Context parameter
    - Use Context for logging (ctx.info, ctx.error)
    - Call semantic engine search method
    - Handle Bedrock errors gracefully
    - Format response as JSON with relevance scores
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.7_
  
  - [x] 9.6 Implement search_episodes combined tool
    - Add @mcp.tool() decorator
    - Use SearchRouter to route query
    - Support optional search_type hint
    - Format response consistently regardless of backend
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  
  - [x] 9.7 Write property tests for response formats
    - **Property 20: Response Format Consistency**
    - **Validates: Requirements 7.7, 9.1**
    - **Property 21: Error Response Structure**
    - **Validates: Requirements 8.4, 9.6**
    - **Property 9: Empty Result Handling**
    - **Validates: Requirements 4.5, 5.3, 6.5**

- [x] 10. Checkpoint - Verify all tools work correctly
  - Test each tool with various inputs
  - Verify response formats match schema
  - Verify error handling works correctly
  - Ask the user if questions arise

- [x] 11. Refactor code organization and structure
  - [x] 11.1 Create src directory structure
    - Create `src/` directory with subdirectories: models, rss, search, aws, tools, utils
    - Create `__init__.py` files in all directories
    - _Requirements: 14.1, 14.4_
  
  - [x] 11.2 Split monolithic file into focused modules
    - Move data models to `src/models/episode.py` and `src/models/search_result.py`
    - Move RSS logic to `src/rss/feed_manager.py` and `src/rss/parser.py`
    - Move search logic to `src/search/router.py`, `src/search/deterministic.py`, `src/search/semantic.py`
    - Move AWS logic to `src/aws/client_manager.py`
    - Move tool implementations to `src/tools/*.py` (one file per tool)
    - Move utilities to `src/utils/logging.py` and `src/utils/validation.py`
    - Create `src/server.py` for server initialization
    - Create `src/config.py` for configuration management
    - _Requirements: 14.2, 14.3, 14.10_
  
  - [x] 11.3 Update imports and entry point
    - Update all imports to use relative imports within src package
    - Update `podcast_search_server.py` to import from src package
    - Ensure venv continues to work with new structure
    - _Requirements: 14.6, 14.7_
  
  - [x] 11.4 Clean up project root
    - Remove unnecessary test files: `debug_guest_extraction.py`, `test_all_tools.py`, `test_rss_checkpoint.py`, `test_tools_direct.py`, `test_tools_mock.py`, `verify_aws_auth.py`, `verify_tools_manual.py`
    - Remove documentation files: `CHECKPOINT_10_VERIFICATION.md`, `TASK_7_COMPLETION.md`, `TASK_8_COMPLETION.md`, `VERIFICATION_RESULTS.md`
    - Keep only essential files in root: `podcast_search_server.py`, `README.md`, `requirements.txt`, `.env.example`, `.gitignore`
    - _Requirements: 14.8, 14.9_
  
  - [x] 11.5 Verify refactored code works
    - Run all existing tests to ensure they still pass
    - Test server startup with new structure
    - Test all tools with new structure
    - Verify imports work correctly
    - _Requirements: 14.1, 14.2, 14.3, 14.6, 14.7_

- [x] 12. Add server startup and transport configuration
  - [x] 12.1 Implement main entry point
    - Add `if __name__ == "__main__"` block
    - Check MCP_TRANSPORT environment variable
    - Configure stdio transport (default)
    - Configure HTTP transport (for AgentCore)
    - Call `mcp.run()` with appropriate transport
    - _Requirements: 1.1, 1.2, 13.1, 13.2, 13.3_
  
  - [x] 12.2 Add initialization error handling
    - Wrap initialization in try-except
    - Log descriptive error messages
    - Exit gracefully on failure
    - _Requirements: 1.4, 10.5_
  
  - [x] 12.3 Write unit tests for server initialization
    - Test successful initialization with valid config
    - Test failure with missing required config
    - Test failure with invalid AWS credentials
    - Test tool registration
    - _Requirements: 1.1, 1.3, 1.4, 10.5_

- [x] 13. Add logging and monitoring
  - [x] 13.1 Configure structured logging
    - Set up JSON logging format (CloudWatch compatible)
    - Configure log levels (ERROR, WARN, INFO, DEBUG)
    - Add logging to all major operations
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 13.6_
  
  - [x] 13.2 Add error logging
    - Log all errors with context and stack traces
    - Log AWS API errors with error codes
    - Log RSS parsing errors with problematic XML
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 14. Create deployment artifacts
  - [x] 14.1 Create Dockerfile
    - Use python:3.11-slim base image
    - Copy requirements.txt and install dependencies
    - Copy application code
    - Set environment variables for HTTP transport
    - Add health check endpoint
    - Expose port 8080
    - _Requirements: 13.1, 13.2, 13.3, 13.6_
  
  - [x] 14.2 Create .env.example file
    - Document all environment variables
    - Provide example values
    - Include comments explaining each variable
    - _Requirements: 13.7_
  
  - [x] 14.3 Create README.md
    - Document installation and setup
    - Document usage with Strands agents
    - Document deployment to AgentCore
    - Include examples for each tool
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 15. Integration testing
  - [x] 15.1 Write integration tests for stdio transport
    - Test server startup with stdio
    - Test tool invocation via MCP client
    - Test with real RSS feed
    - Test with real Bedrock Knowledge Base (if available)
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 15.2 Write integration tests for HTTP transport
    - Test server startup with HTTP
    - Test health check endpoint
    - Test tool invocation via HTTP
    - _Requirements: 13.1, 13.2, 13.3_

- [-] 16. Final checkpoint - End-to-end testing
  - Test complete workflow: start server → invoke tools → verify results
  - Test with FastMCP CLI (`fastmcp dev`)
  - Test with Strands agent integration
  - Verify all requirements are met
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The implementation is designed to support both stdio (local) and HTTP (AgentCore) transports without code changes
