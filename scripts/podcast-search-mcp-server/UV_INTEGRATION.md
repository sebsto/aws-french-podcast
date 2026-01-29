# UV Integration Complete ✅

## Summary

The Podcast Search MCP Server now uses `uv` for dependency management and execution. This provides faster, more reliable dependency resolution and eliminates the need for manual virtual environment management.

## Changes Made

### 1. Added `pyproject.toml`

Created a `pyproject.toml` file with:
- Project metadata and dependencies
- Development dependencies (pytest, hypothesis)
- Python version requirement (>=3.11)
- Pytest configuration

```toml
[project]
name = "podcast-search-mcp-server"
version = "1.0.0"
requires-python = ">=3.11"
dependencies = [
    "fastmcp>=0.2.0",
    "boto3>=1.34.0",
    "feedparser>=6.0.0",
    "python-dateutil>=2.8.0",
]

[dependency-groups]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "hypothesis>=6.100.0",
]
```

### 2. Updated Kiro MCP Configuration

Updated `aws_french_podcast/.kiro/settings/mcp.json` to use `uv run`:

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
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false
    }
  }
}
```

### 3. Updated Documentation

Updated the following files:
- **README.md** - Installation and usage instructions
- **QUICK_START.md** - Quick reference guide
- Both now show `uv` as the recommended method

## Usage

### Install Dependencies
```bash
cd aws_french_podcast/podcast-search-mcp-server
uv sync
```

This automatically:
- Creates a `.venv` directory
- Installs all dependencies
- Sets up the development environment

### Run the Server
```bash
# Recommended method
uv run podcast_search_server.py

# Or with FastMCP CLI
fastmcp dev podcast_search_server.py
```

### Run Tests
```bash
# All tests
uv run pytest

# Specific test file
uv run pytest tests/test_e2e_complete.py -v

# Quick verification
uv run verify_e2e.py
```

## Benefits of UV

1. **Faster:** 10-100x faster than pip for dependency resolution
2. **Reliable:** Consistent dependency resolution across environments
3. **Automatic:** No need to manually activate virtual environments
4. **Modern:** Uses the latest Python packaging standards
5. **Simple:** Single command to install and run

## Verification

### Test UV Integration
```bash
cd aws_french_podcast/podcast-search-mcp-server

# This should work without any manual setup
uv run podcast_search_server.py
```

Expected behavior:
- UV automatically installs dependencies if needed
- Server initializes and caches 342 episodes
- Server runs in stdio mode waiting for MCP commands

### Test with Kiro

1. **Restart Kiro** to reload the MCP configuration
2. **Check MCP Server view** - "podcast-search" should appear
3. **Test with a query:**
   ```
   Find episode 342
   ```

## Troubleshooting

### UV Not Found
```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or with Homebrew
brew install uv
```

### Dependencies Not Installing
```bash
# Force reinstall
uv sync --reinstall

# Or clear cache
rm -rf .venv
uv sync
```

### Server Won't Start
```bash
# Check dependencies
uv run python -c "import fastmcp; print('OK')"

# Check AWS credentials
aws sts get-caller-identity --profile podcast

# Run with debug logging
FASTMCP_LOG_LEVEL=DEBUG uv run podcast_search_server.py
```

## Migration Notes

### Old Method (venv)
```bash
source venv/bin/activate
python podcast_search_server.py
```

### New Method (uv)
```bash
uv run podcast_search_server.py
```

The old `venv` directory can be removed if desired:
```bash
rm -rf venv
```

UV creates its own `.venv` directory which is managed automatically.

## Current Status

✅ **UV Integration:** Complete  
✅ **pyproject.toml:** Created  
✅ **MCP Configuration:** Updated  
✅ **Documentation:** Updated  
✅ **Testing:** Verified working  

## Next Steps

1. **Restart Kiro** to load the updated MCP configuration
2. **Test the server** with podcast search queries
3. **Remove old venv** (optional): `rm -rf venv`

---

*UV Integration completed: January 23, 2026*  
*All documentation updated to use `uv run` as the recommended method*
