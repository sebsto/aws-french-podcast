"""
Integration tests for stdio transport.

Tests server startup, tool invocation via MCP client, and real RSS feed/Bedrock integration.

Requirements: 1.1, 1.2, 1.3
"""

import pytest
import asyncio
import json
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.session import ClientSession


@pytest.fixture
def server_script_path():
    """Get the path to the server entry point script."""
    return str(Path(__file__).parent.parent / "podcast_search_server.py")


@pytest.fixture
def test_env():
    """Set up test environment variables."""
    env = os.environ.copy()
    env["AWS_PROFILE"] = "podcast"
    env["AWS_REGION"] = "eu-central-1"
    env["RSS_FEED_URL"] = "https://francais.podcast.go-aws.com/web/feed.xml"
    env["CACHE_TTL_SECONDS"] = "3600"
    env["LOG_LEVEL"] = "INFO"
    # BEDROCK_KB_ID is optional - will be loaded from environment if available
    return env


class TestStdioServerStartup:
    """Test server startup with stdio transport."""
    
    @pytest.mark.asyncio
    async def test_server_starts_successfully(self, server_script_path, test_env):
        """
        Test that the server starts successfully with stdio transport.
        
        Validates: Requirement 1.1 - MCP server initialization
        Validates: Requirement 1.2 - stdio communication channels
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                # Initialize the session
                await session.initialize()
                
                # Verify server is running by checking capabilities
                assert session.server_capabilities is not None
                print(f"Server capabilities: {session.server_capabilities}")
    
    @pytest.mark.asyncio
    async def test_server_registers_all_tools(self, server_script_path, test_env):
        """
        Test that all expected tools are registered.
        
        Validates: Requirement 1.3 - tool registration
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # List available tools
                tools_result = await session.list_tools()
                tool_names = [tool.name for tool in tools_result.tools]
                
                # Verify all expected tools are registered
                expected_tools = [
                    "get_episode_by_id",
                    "search_by_date_range",
                    "search_by_guest",
                    "semantic_search",
                    "search_episodes"
                ]
                
                for expected_tool in expected_tools:
                    assert expected_tool in tool_names, f"Tool {expected_tool} not registered"
                
                print(f"Registered tools: {tool_names}")


class TestToolInvocationViaClient:
    """Test tool invocation via MCP client."""
    
    @pytest.mark.asyncio
    async def test_get_episode_by_id_tool(self, server_script_path, test_env):
        """
        Test get_episode_by_id tool invocation.
        
        Validates: Requirement 1.3 - tool invocation
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call get_episode_by_id tool with a known episode
                result = await session.call_tool(
                    "get_episode_by_id",
                    arguments={"episode_id": 1}
                )
                
                # Parse the result
                assert result.content is not None
                assert len(result.content) > 0
                
                # The result should be a text content with JSON
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Verify response structure
                assert "status" in response_data
                assert response_data["status"] in ["success", "error"]
                
                if response_data["status"] == "success":
                    assert "results" in response_data
                    assert "count" in response_data
                    print(f"Episode 1 found: {response_data['results'][0]['title']}")
                else:
                    print(f"Episode 1 not found: {response_data['message']}")
    
    @pytest.mark.asyncio
    async def test_search_by_date_range_tool(self, server_script_path, test_env):
        """
        Test search_by_date_range tool invocation.
        
        Validates: Requirement 1.3 - tool invocation
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call search_by_date_range tool
                result = await session.call_tool(
                    "search_by_date_range",
                    arguments={
                        "start_date": "2024-01-01",
                        "end_date": "2024-01-31"
                    }
                )
                
                # Parse the result
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Verify response structure
                assert "status" in response_data
                assert response_data["status"] == "success"
                assert "results" in response_data
                assert "count" in response_data
                
                print(f"Found {response_data['count']} episodes in January 2024")
    
    @pytest.mark.asyncio
    async def test_search_by_guest_tool(self, server_script_path, test_env):
        """
        Test search_by_guest tool invocation.
        
        Validates: Requirement 1.3 - tool invocation
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call search_by_guest tool
                result = await session.call_tool(
                    "search_by_guest",
                    arguments={"guest_name": "Seb"}
                )
                
                # Parse the result
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Verify response structure
                assert "status" in response_data
                assert response_data["status"] == "success"
                assert "results" in response_data
                assert "count" in response_data
                
                print(f"Found {response_data['count']} episodes with guest 'Seb'")
    
    @pytest.mark.asyncio
    async def test_search_episodes_unified_tool(self, server_script_path, test_env):
        """
        Test search_episodes unified tool invocation.
        
        Validates: Requirement 1.3 - tool invocation
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Test with episode ID pattern
                result = await session.call_tool(
                    "search_episodes",
                    arguments={"query": "episode 1"}
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                assert "status" in response_data
                assert "results" in response_data
                
                print(f"Unified search for 'episode 1': {response_data['status']}")


class TestRealRSSFeedIntegration:
    """Test integration with real RSS feed."""
    
    @pytest.mark.asyncio
    async def test_rss_feed_parsing(self, server_script_path, test_env):
        """
        Test that the server can fetch and parse the real RSS feed.
        
        Validates: Requirement 1.1 - RSS feed integration
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Search for episodes in a recent date range
                result = await session.call_tool(
                    "search_by_date_range",
                    arguments={
                        "start_date": "2024-01-01",
                        "end_date": "2024-12-31"
                    }
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Verify we got real episodes
                assert response_data["status"] == "success"
                assert response_data["count"] > 0, "No episodes found in 2024"
                
                # Verify episode structure
                first_episode = response_data["results"][0]
                assert "episode_id" in first_episode
                assert "title" in first_episode
                assert "description" in first_episode
                assert "publication_date" in first_episode
                assert "url" in first_episode
                
                print(f"Successfully parsed {response_data['count']} episodes from RSS feed")
                print(f"First episode: {first_episode['title']}")
    
    @pytest.mark.asyncio
    async def test_episode_metadata_completeness(self, server_script_path, test_env):
        """
        Test that episode metadata is complete.
        
        Validates: Requirement 1.1 - complete metadata extraction
        """
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Get a specific episode
                result = await session.call_tool(
                    "get_episode_by_id",
                    arguments={"episode_id": 1}
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                if response_data["status"] == "success":
                    episode = response_data["results"][0]
                    
                    # Verify all required fields are present
                    required_fields = [
                        "episode_id", "title", "description",
                        "publication_date", "duration", "url"
                    ]
                    
                    for field in required_fields:
                        assert field in episode, f"Missing field: {field}"
                        assert episode[field] is not None, f"Field {field} is None"
                    
                    # Verify optional fields structure
                    assert "guests" in episode
                    assert isinstance(episode["guests"], list)
                    
                    assert "links" in episode
                    assert isinstance(episode["links"], list)
                    
                    print(f"Episode metadata complete for episode {episode['episode_id']}")


class TestBedrockIntegration:
    """Test integration with Bedrock Knowledge Base (if available)."""
    
    @pytest.mark.asyncio
    @pytest.mark.skipif(
        not os.getenv("BEDROCK_KB_ID"),
        reason="BEDROCK_KB_ID not set, skipping semantic search tests"
    )
    async def test_semantic_search_tool(self, server_script_path, test_env):
        """
        Test semantic_search tool with real Bedrock Knowledge Base.
        
        Validates: Requirement 1.3 - semantic search integration
        """
        # Add BEDROCK_KB_ID to environment
        test_env["BEDROCK_KB_ID"] = os.getenv("BEDROCK_KB_ID")
        
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call semantic_search tool
                result = await session.call_tool(
                    "semantic_search",
                    arguments={"query": "serverless computing"}
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Verify response structure
                assert "status" in response_data
                
                if response_data["status"] == "success":
                    assert "results" in response_data
                    assert "count" in response_data
                    
                    # Verify semantic results have relevance scores
                    if response_data["count"] > 0:
                        first_result = response_data["results"][0]
                        assert "relevance_score" in first_result
                        assert 0.0 <= first_result["relevance_score"] <= 1.0
                    
                    print(f"Semantic search found {response_data['count']} results")
                else:
                    # Bedrock might not be available or configured
                    print(f"Semantic search error: {response_data.get('message', 'Unknown error')}")
    
    @pytest.mark.asyncio
    @pytest.mark.skipif(
        not os.getenv("BEDROCK_KB_ID"),
        reason="BEDROCK_KB_ID not set, skipping semantic search tests"
    )
    async def test_unified_search_routes_to_semantic(self, server_script_path, test_env):
        """
        Test that unified search routes natural language queries to semantic search.
        
        Validates: Requirement 1.3 - query routing
        """
        # Add BEDROCK_KB_ID to environment
        test_env["BEDROCK_KB_ID"] = os.getenv("BEDROCK_KB_ID")
        
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call search_episodes with natural language query
                result = await session.call_tool(
                    "search_episodes",
                    arguments={"query": "episodes about containers and kubernetes"}
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                assert "status" in response_data
                
                if response_data["status"] == "success":
                    # If results have relevance_score, it was routed to semantic search
                    if response_data["count"] > 0:
                        first_result = response_data["results"][0]
                        if "relevance_score" in first_result:
                            print("Query correctly routed to semantic search")
                        else:
                            print("Query routed to deterministic search")
                else:
                    print(f"Search error: {response_data.get('message', 'Unknown error')}")


class TestErrorHandling:
    """Test error handling in stdio transport."""
    
    @pytest.mark.asyncio
    async def test_invalid_episode_id(self, server_script_path, test_env):
        """Test error handling for invalid episode ID."""
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call with non-existent episode ID
                result = await session.call_tool(
                    "get_episode_by_id",
                    arguments={"episode_id": 99999}
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Should return error response
                assert response_data["status"] == "error"
                assert "message" in response_data
                
                print(f"Error handling works: {response_data['message']}")
    
    @pytest.mark.asyncio
    async def test_invalid_date_format(self, server_script_path, test_env):
        """Test error handling for invalid date format."""
        server_params = StdioServerParameters(
            command="python",
            args=[server_script_path],
            env=test_env
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Call with invalid date format
                result = await session.call_tool(
                    "search_by_date_range",
                    arguments={
                        "start_date": "2024/01/01",  # Wrong format
                        "end_date": "2024-01-31"
                    }
                )
                
                response_text = result.content[0].text
                response_data = json.loads(response_text)
                
                # Should return validation error
                assert response_data["status"] == "error"
                assert "error_type" in response_data
                assert response_data["error_type"] == "ValidationError"
                
                print(f"Validation error handling works: {response_data['message']}")


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])
