# Podcast Search MCP Server

A Model Context Protocol (MCP) server that provides intelligent search capabilities for the AWS French Podcast. Built with the FastMCP framework for integration with Strands Agents.

## Features

- **Deterministic Search**: Search episodes by ID, date range, or guest name using RSS feed data
- **Semantic Search**: Natural language search using Amazon Bedrock Knowledge Base
- **Intelligent Routing**: Automatically routes queries to the appropriate search backend
- **Dual Transport**: Supports both stdio (local) and HTTP (AgentCore) transports

## Installation

### Prerequisites

- Python 3.11 or higher
- [uv](https://docs.astral.sh/uv/) - Fast Python package installer and runner
- AWS credentials configured with access to eu-central-1 region
- Access to the AWS French Podcast Bedrock Knowledge Base

### Setup

1. Install uv (if not already installed):
```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or with Homebrew
brew install uv

# Or with pip
pip install uv
```

2. Install dependencies:
```bash
cd aws_french_podcast/podcast-search-mcp-server

# Install all dependencies (uv handles everything automatically)
uv sync
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration (already configured for this project)
```

## Configuration

The server is configured via environment variables:

- `AWS_PROFILE`: AWS profile name (default: "podcast")
- `AWS_REGION`: AWS region (default: "eu-central-1")
- `RSS_FEED_URL`: RSS feed URL (default: "https://francais.podcast.go-aws.com/web/feed.xml")
- `BEDROCK_KB_ID`: Bedrock Knowledge Base ID (required for semantic search)
- `CACHE_TTL_SECONDS`: RSS cache TTL in seconds (default: 3600)
- `MAX_SEMANTIC_RESULTS`: Maximum semantic search results (default: 10)
- `MCP_TRANSPORT`: Transport type - "stdio" or "http" (default: "stdio")

## Usage

### Local Development (stdio)

Run the server with stdio transport:

```bash
# With uv (recommended)
uv run podcast_search_server.py

# Or using the virtual environment
./venv/bin/python podcast_search_server.py
```

Or using uvx (no installation required):

```bash
uvx --from . podcast_search_server.py
```

### Testing with FastMCP CLI

Use the FastMCP development tools:

```bash
fastmcp dev podcast_search_server.py
```

### MCP Configuration for Kiro

Add this configuration to your `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "podcast-search": {
      "command": "uv",
      "args": [
        "run",
        "--directory",
        "podcast-search-mcp-server",
        "podcast_search_server.py"
      ],
      "env": {
        "AWS_PROFILE": "podcast",
        "AWS_REGION": "eu-central-1",
        "RSS_FEED_URL": "https://francais.podcast.go-aws.com/web/feed.xml",
        "BEDROCK_KB_ID": "<your-knowledge-base-id>",
        "CACHE_TTL_SECONDS": "3600",
        "MAX_SEMANTIC_RESULTS": "10",
        "MCP_TRANSPORT": "stdio",
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Configuration Notes:**
- Replace `<your-knowledge-base-id>` with your actual Bedrock Knowledge Base ID
- The `AWS_PROFILE` is set to "podcast" to use the correct AWS credentials
- The `AWS_REGION` is set to "eu-central-1" where the podcast resources are deployed
- The `--directory` flag tells uv where to find the project
- `uv run` automatically manages dependencies without needing a separate virtual environment
- Set `FASTMCP_LOG_LEVEL` to "DEBUG" for troubleshooting

### Integration with Strands Agent

Example of using the MCP server with a Strands agent:

```python
from mcp import stdio_client, StdioServerParameters
from strands import Agent
from strands.tools.mcp import MCPClient

# Create MCP client
mcp_client = MCPClient(lambda: stdio_client(
    StdioServerParameters(
        command="python",
        args=["podcast_search_server.py"],
        env={
            "AWS_PROFILE": "podcast",
            "AWS_REGION": "eu-central-1",
            "BEDROCK_KB_ID": "<your-kb-id>",
            "RSS_FEED_URL": "https://francais.podcast.go-aws.com/web/feed.xml"
        }
    )
))

# Use the tools with an agent
with mcp_client:
    tools = mcp_client.list_tools_sync()
    agent = Agent(tools=tools)
    
    # Example queries
    response = agent("Find episodes about serverless from 2024")
    response = agent("Get details for episode 341")
    response = agent("Find episodes featuring John Doe")
```

### Using Individual Tools

You can also call tools directly:

```python
# Search episodes with automatic routing
result = mcp_client.call_tool_sync(
    "search_episodes",
    {"query": "episodes about machine learning"}
)

# Get specific episode
result = mcp_client.call_tool_sync(
    "get_episode_by_id",
    {"episode_id": 341}
)

# Search by date range
result = mcp_client.call_tool_sync(
    "search_by_date_range",
    {"start_date": "2024-01-01", "end_date": "2024-12-31"}
)

# Search by guest
result = mcp_client.call_tool_sync(
    "search_by_guest",
    {"guest_name": "John"}
)

# Semantic search
result = mcp_client.call_tool_sync(
    "semantic_search",
    {"query": "AWS security best practices"}
)
```

## Available Tools

The server provides five search tools for discovering podcast episodes:

### 1. search_episodes

**Unified search interface with automatic query routing**

This tool automatically detects the query type and routes to the appropriate search backend:
- Episode ID patterns (e.g., "episode 341", "#341") → Episode ID search
- Date patterns (e.g., "2024-01-01 to 2024-12-31") → Date range search
- Guest indicators (e.g., "with John", "featuring Jane") → Guest search
- Natural language queries → Semantic search

**Parameters:**
- `query` (string, required): Search query
- `search_type` (string, optional): Override auto-detection with "id", "date", "guest", or "semantic"

**Example:**
```json
{
  "query": "episodes about serverless from 2024"
}
```

**Response:**
```json
{
  "status": "success",
  "count": 5,
  "results": [
    {
      "episode_id": 341,
      "title": "Serverless Architecture Best Practices",
      "description": "...",
      "publication_date": "2024-01-15T10:00:00+01:00",
      "duration": "00:45:30",
      "url": "https://francais.podcast.go-aws.com/episodes/341",
      "guests": [...],
      "links": [...],
      "relevance_score": 0.95
    }
  ]
}
```

### 2. get_episode_by_id

**Get detailed information about a specific episode by ID**

Retrieves complete metadata for a single episode using its episode number.

**Parameters:**
- `episode_id` (integer, required): Episode number (e.g., 341)

**Example:**
```json
{
  "episode_id": 341
}
```

**Response:**
```json
{
  "status": "success",
  "count": 1,
  "results": [
    {
      "episode_id": 341,
      "title": "Episode Title",
      "description": "Full episode description...",
      "publication_date": "2024-01-15T10:00:00+01:00",
      "duration": "00:45:30",
      "url": "https://francais.podcast.go-aws.com/episodes/341",
      "file_size": 12345678,
      "guests": [
        {
          "name": "Guest Name",
          "title": "Guest Title",
          "linkedin_url": "https://linkedin.com/in/guest"
        }
      ],
      "links": [
        {
          "text": "Related Link",
          "url": "https://example.com"
        }
      ]
    }
  ]
}
```

### 3. search_by_date_range

**Find episodes published within a date range**

Searches for episodes published between two dates (inclusive). Results are sorted by publication date in descending order (newest first).

**Parameters:**
- `start_date` (string, required): Start date in ISO 8601 format (YYYY-MM-DD)
- `end_date` (string, required): End date in ISO 8601 format (YYYY-MM-DD)

**Example:**
```json
{
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**Response:**
```json
{
  "status": "success",
  "count": 12,
  "results": [...],
  "message": "Found 12 episode(s) between 2024-01-01 and 2024-12-31"
}
```

### 4. search_by_guest

**Find episodes featuring a specific guest**

Searches for episodes by guest name using case-insensitive partial matching. Results are sorted by publication date in descending order.

**Parameters:**
- `guest_name` (string, required): Guest name or partial name

**Example:**
```json
{
  "guest_name": "John"
}
```

**Response:**
```json
{
  "status": "success",
  "count": 3,
  "results": [...],
  "message": "Found 3 episode(s) featuring 'John'"
}
```

### 5. semantic_search

**Natural language search across episode content**

Performs semantic search using Amazon Bedrock Knowledge Base to find episodes by topic or subject matter. Returns results with relevance scores.

**Parameters:**
- `query` (string, required): Natural language query about topics or subjects

**Example:**
```json
{
  "query": "machine learning and AI on AWS"
}
```

**Response:**
```json
{
  "status": "success",
  "count": 10,
  "results": [
    {
      "episode_id": 341,
      "title": "Episode Title",
      "excerpt": "Relevant text snippet from the episode...",
      "relevance_score": 0.95,
      "publication_date": "2024-01-15T10:00:00+01:00",
      "url": "https://francais.podcast.go-aws.com/episodes/341",
      "guests": [...],
      "links": [...]
    }
  ],
  "message": "Found 10 relevant episode(s)"
}
```

### Error Responses

All tools return structured error responses when issues occur:

```json
{
  "status": "error",
  "error_type": "ValidationError",
  "message": "Invalid date format. Expected YYYY-MM-DD",
  "suggested_action": "Provide dates in ISO 8601 format (YYYY-MM-DD)"
}
```

**Error Types:**
- `ValidationError`: Invalid input parameters
- `NotFoundError`: Requested resource doesn't exist
- `ConfigurationError`: Missing or invalid configuration
- `BedrockError`: AWS Bedrock API failure
- `ServerError`: Internal server error

## Development

### Project Structure

```
podcast-search-mcp-server/
├── src/                         # Source code
│   ├── __init__.py
│   ├── server.py                # FastMCP server initialization
│   ├── config.py                # Configuration management
│   ├── models/                  # Data models
│   │   ├── episode.py           # Episode, Guest, Link models
│   │   └── search_result.py     # Search result models
│   ├── rss/                     # RSS feed management
│   │   ├── feed_manager.py      # Feed fetching and caching
│   │   └── parser.py            # RSS XML parsing
│   ├── search/                  # Search engines
│   │   ├── router.py            # Query routing
│   │   ├── deterministic.py     # ID, date, guest search
│   │   └── semantic.py          # Bedrock semantic search
│   ├── aws/                     # AWS integration
│   │   └── client_manager.py    # AWS credential management
│   ├── tools/                   # MCP tool implementations
│   │   ├── search_episodes.py
│   │   ├── get_episode_by_id.py
│   │   ├── search_by_date_range.py
│   │   ├── search_by_guest.py
│   │   └── semantic_search.py
│   └── utils/                   # Utilities
│       ├── logging.py           # Logging configuration
│       └── validation.py        # Input validation
├── tests/                       # Test suite
│   ├── test_*.py                # Unit and property tests
│   └── ...
├── podcast_search_server.py     # Main entry point
├── requirements.txt             # Python dependencies
├── Dockerfile                   # Docker configuration
├── .env.example                 # Example environment config
├── .gitignore                   # Git ignore rules
└── README.md                    # This file
```

### Running Tests

Run the test suite using `uv`:

```bash
# Run all tests
uv run pytest

# Run with verbose output
uv run pytest -v

# Run specific test file
uv run pytest tests/test_rss_feed_properties.py

# Run with coverage
uv run pytest --cov=src --cov-report=html
```

## Deployment

### Local Development (stdio)

The server runs locally using stdio transport for integration with MCP clients like Kiro:

```bash
python podcast_search_server.py
```

### Docker Deployment (HTTP)

Build and run the server as a Docker container with HTTP transport:

```bash
# Build the Docker image
docker build -t podcast-search-mcp-server .

# Run the container
docker run -p 8080:8080 \
  -e AWS_PROFILE=podcast \
  -e AWS_REGION=eu-central-1 \
  -e BEDROCK_KB_ID=<your-knowledge-base-id> \
  -e RSS_FEED_URL=https://francais.podcast.go-aws.com/web/feed.xml \
  podcast-search-mcp-server
```

**Note:** When running in Docker, you'll need to mount AWS credentials:

```bash
docker run -p 8080:8080 \
  -v ~/.aws:/root/.aws:ro \
  -e AWS_PROFILE=podcast \
  -e AWS_REGION=eu-central-1 \
  -e BEDROCK_KB_ID=<your-knowledge-base-id> \
  podcast-search-mcp-server
```

### Amazon Bedrock AgentCore Deployment

The server is designed to be deployed to Amazon Bedrock AgentCore with HTTP transport:

1. **Build the Docker image:**
```bash
docker build -t podcast-search-mcp-server .
```

2. **Push to Amazon ECR:**
```bash
# Authenticate with ECR
aws ecr get-login-password --region eu-central-1 --profile podcast | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-central-1.amazonaws.com

# Tag the image
docker tag podcast-search-mcp-server:latest \
  <account-id>.dkr.ecr.eu-central-1.amazonaws.com/podcast-search-mcp-server:latest

# Push to ECR
docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/podcast-search-mcp-server:latest
```

3. **Deploy to AgentCore:**
   - Create an AgentCore application
   - Configure the container image from ECR
   - Set environment variables (BEDROCK_KB_ID, AWS_REGION, etc.)
   - Configure IAM role with permissions for Bedrock Knowledge Base
   - Deploy and test

**Required IAM Permissions for AgentCore:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:Retrieve",
        "bedrock:RetrieveAndGenerate"
      ],
      "Resource": "arn:aws:bedrock:eu-central-1:<account-id>:knowledge-base/<kb-id>"
    }
  ]
}
```

### Health Check

When running with HTTP transport, the server provides a health check endpoint:

```bash
curl http://localhost:8080/health
```

### Environment Variables for Deployment

For production deployments, configure these environment variables:

- `MCP_TRANSPORT=http` - Use HTTP transport
- `MCP_HTTP_HOST=0.0.0.0` - Bind to all interfaces
- `MCP_HTTP_PORT=8080` - HTTP port
- `AWS_REGION=eu-central-1` - AWS region
- `BEDROCK_KB_ID=<your-kb-id>` - Knowledge Base ID
- `RSS_FEED_URL=https://francais.podcast.go-aws.com/web/feed.xml` - RSS feed URL
- `CACHE_TTL_SECONDS=3600` - Cache TTL (optional)
- `MAX_SEMANTIC_RESULTS=10` - Max semantic results (optional)

**Note:** When deploying to AgentCore, use IAM roles instead of AWS_PROFILE for authentication.

## License

This project is part of the AWS French Podcast infrastructure.

## Support

For issues or questions, please contact the AWS French Podcast team.
