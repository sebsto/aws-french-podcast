#!/usr/bin/env python3
"""
Podcast Search MCP Server

A Model Context Protocol server that provides intelligent search capabilities
for the AWS French Podcast. Supports both deterministic searches (RSS feed)
and semantic searches (Amazon Bedrock Knowledge Base).

Built with the FastMCP framework for the Strands Agents ecosystem.
"""

import os
import sys

from src.server import initialize_server, get_server, set_components

# Initialize server components at module level for FastMCP CLI
config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
set_components(config, rss_manager, aws_client, semantic_engine, search_router)

# Expose mcp variable for FastMCP CLI
mcp = get_server()


def main():
    """Main entry point for the MCP server."""
    try:
        # Get the FastMCP server instance (already initialized at module level)
        server = get_server()
        
        # Check for transport configuration
        transport = os.getenv("MCP_TRANSPORT", "stdio")
        
        if transport in ["http", "sse", "streamable-http"]:
            # HTTP-based transport for AgentCore deployment or testing
            host = os.getenv("MCP_HTTP_HOST", "0.0.0.0")
            port = int(os.getenv("MCP_HTTP_PORT", "8080"))
            print(f"[INFO] Starting {transport} transport on {host}:{port}", file=sys.stderr)
            server.run(transport=transport, host=host, port=port)
        else:
            # Default stdio transport for local execution
            print(f"[INFO] Starting stdio transport", file=sys.stderr)
            server.run()
            
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped by user", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR] Server failed to start: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
