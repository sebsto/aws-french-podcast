# Quick Start Guide - Podcast Search MCP Server

## Installation

```bash
cd aws_french_podcast/podcast-search-mcp-server

# Install dependencies with uv (recommended)
uv sync

# Or install with pip
pip install -r requirements.txt
```

## Configuration

The server is already configured with:
- AWS Profile: `podcast`
- AWS Region: `eu-central-1`
- RSS Feed: `https://francais.podcast.go-aws.com/web/feed.xml`
- Bedrock KB ID: `OT4JU2FZZF`

Configuration is in `.env` file (already set up).

## Testing

### Run All Tests
```bash
# With uv (recommended)
uv run pytest tests/test_e2e_complete.py -v

# Or with venv
./venv/bin/python -m pytest tests/test_e2e_complete.py -v
```

### Quick Verification
```bash
# With uv (recommended)
uv run verify_e2e.py

# Or with venv
./venv/bin/python verify_e2e.py
```

Expected output:
```
✅ ALL TESTS PASSED - Server is ready for deployment!
```

## Running the Server

### Local Development (stdio) - Recommended
```bash
# With uv (recommended)
uv run podcast_search_server.py

# Or with venv
./venv/bin/python podcast_search_server.py
```

### With FastMCP CLI
```bash
fastmcp dev podcast_search_server.py
```

### HTTP Mode (for testing)
```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=8080 uv run podcast_search_server.py
```

## Using with Kiro

### 1. Add to Kiro Configuration

The configuration has already been added to `aws_french_podcast/.kiro/settings/mcp.json`:

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
        "BEDROCK_KB_ID": "OT4JU2FZZF",
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

**Note:** 
- Uses `uv run` for automatic dependency management
- The `--directory` flag points to the server directory
- Path is relative to the workspace root (`aws_french_podcast/`)

### 2. Restart Kiro or Reconnect MCP Server

From Kiro's MCP Server view, reconnect the server.

### 3. Test with Queries

Ask Kiro:
- "Find episode 342"
- "Show me episodes from 2024"
- "Find episodes about serverless"
- "Search for episodes featuring Philippe Desmaison"

## Available Tools

| Tool | Description | Example |
|------|-------------|---------|
| `search_episodes` | Unified search with auto-routing | "episodes about AWS security" |
| `get_episode_by_id` | Get specific episode | episode_id: 342 |
| `search_by_date_range` | Find by date | "2024-01-01" to "2024-12-31" |
| `search_by_guest` | Find by guest name | "Philippe Desmaison" |
| `semantic_search` | Natural language search | "machine learning on AWS" |

## Example Tool Calls

### Get Episode by ID
```json
{
  "tool": "get_episode_by_id",
  "arguments": {
    "episode_id": 342
  }
}
```

### Search by Date Range
```json
{
  "tool": "search_by_date_range",
  "arguments": {
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  }
}
```

### Search by Guest
```json
{
  "tool": "search_by_guest",
  "arguments": {
    "guest_name": "Philippe"
  }
}
```

### Semantic Search
```json
{
  "tool": "semantic_search",
  "arguments": {
    "query": "AWS security best practices"
  }
}
```

### Combined Search (Auto-routing)
```json
{
  "tool": "search_episodes",
  "arguments": {
    "query": "episode 342"
  }
}
```

## Response Format

All tools return JSON with this structure:

### Success Response
```json
{
  "status": "success",
  "count": 1,
  "results": [
    {
      "episode_id": 342,
      "title": "Episode Title",
      "description": "Episode description...",
      "publication_date": "2024-01-15T10:00:00+01:00",
      "duration": "00:45:30",
      "url": "https://francais.podcast.go-aws.com/episodes/342",
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

### Error Response
```json
{
  "status": "error",
  "error_type": "NotFoundError",
  "message": "Episode 999 not found",
  "suggested_action": "Check the episode number and try again"
}
```

## Troubleshooting

### Server Won't Start
```bash
# Check AWS credentials
aws sts get-caller-identity --profile podcast

# Check RSS feed accessibility
curl https://francais.podcast.go-aws.com/web/feed.xml

# Check environment variables
cat .env
```

### Tests Failing
```bash
# Run with verbose output
./venv/bin/python -m pytest tests/test_e2e_complete.py -v -s

# Check specific test
./venv/bin/python -m pytest tests/test_e2e_complete.py::TestE2EServerInitialization -v
```

### Kiro Integration Issues
1. Check MCP server status in Kiro's MCP Server view
2. Verify configuration in `.kiro/settings/mcp.json`
3. Check server logs (stderr output)
4. Try reconnecting the server

## Performance

- **Episode ID Search:** <1ms
- **Date Range Search:** <10ms
- **Guest Search:** <10ms
- **RSS Feed Fetch:** ~600ms (cached for 1 hour)
- **Semantic Search:** ~1-2s (depends on Bedrock)

## Current Status

✅ **342 episodes** cached from RSS feed  
✅ **All tests passing** (32/32)  
✅ **AWS credentials** validated  
✅ **Ready for production** use

## Support

For issues or questions:
1. Check `README.md` for detailed documentation
2. Review `E2E_TEST_RESULTS.md` for test results
3. Check `CHECKPOINT_16_COMPLETE.md` for completion status

---

*Quick Start Guide - Version 1.0*  
*Last Updated: January 23, 2026*
