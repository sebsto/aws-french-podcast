#!/usr/bin/env python3
"""
End-to-End Testing for Podcast Search MCP Server

This test suite performs comprehensive end-to-end testing of the MCP server:
1. Server initialization and startup
2. All five tools with various inputs
3. Error handling and edge cases
4. Response format validation
5. Integration with real RSS feed and AWS services
"""

import json
import os
import sys
from datetime import datetime, timedelta
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.server import initialize_server, get_server, set_components
from src.models.episode import Episode


class TestE2EServerInitialization:
    """Test server initialization and component setup"""
    
    def test_server_initializes_successfully(self):
        """Test that the server initializes without errors"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        
        assert config is not None
        assert rss_manager is not None
        assert aws_client is not None
        # semantic_engine can be None if BEDROCK_KB_ID is not configured
        assert search_router is not None
        
        # Verify configuration
        assert config.aws_profile == "podcast"
        assert config.aws_region == "eu-central-1"
        assert config.rss_feed_url == "https://francais.podcast.go-aws.com/web/feed.xml"
        
    def test_server_instance_created(self):
        """Test that FastMCP server instance is created"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        
        mcp = get_server()
        assert mcp is not None
        assert hasattr(mcp, 'run')


class TestE2ERSSFeedOperations:
    """Test RSS feed fetching and caching"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_rss_feed_fetches_successfully(self, components):
        """Test that RSS feed can be fetched and parsed"""
        _, rss_manager, _, _, _ = components
        
        episodes = rss_manager.get_cached_episodes()
        
        assert len(episodes) > 0, "RSS feed should contain episodes"
        assert all(isinstance(ep, Episode) for ep in episodes)
        
    def test_rss_episodes_have_complete_metadata(self, components):
        """Test that episodes have all required metadata fields"""
        _, rss_manager, _, _, _ = components
        
        episodes = rss_manager.get_cached_episodes()
        first_episode = episodes[0]
        
        # Verify all required fields are present
        assert first_episode.id > 0
        assert first_episode.title
        assert first_episode.description
        assert first_episode.publication_date
        assert first_episode.duration
        assert first_episode.url
        assert first_episode.file_size > 0


class TestE2EGetEpisodeByID:
    """Test get_episode_by_id tool"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_get_valid_episode_by_id(self, components):
        """Test retrieving a valid episode by ID"""
        _, rss_manager, _, _, _ = components
        
        # Get first episode ID from feed
        episodes = rss_manager.get_cached_episodes()
        test_episode_id = episodes[0].id
        
        # Search for it
        result = rss_manager.search_by_id(test_episode_id)
        
        assert result is not None
        assert result.id == test_episode_id
        assert result.title
        assert result.description
        
    def test_get_nonexistent_episode_returns_none(self, components):
        """Test that searching for non-existent episode returns None"""
        _, rss_manager, _, _, _ = components
        
        result = rss_manager.search_by_id(999999)
        
        assert result is None


class TestE2EDateRangeSearch:
    """Test search_by_date_range tool"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_date_range_search_returns_results(self, components):
        """Test date range search with valid dates"""
        _, rss_manager, _, _, _ = components
        
        # Search for episodes in 2024
        from datetime import date
        start_date = date(2024, 1, 1)
        end_date = date(2024, 12, 31)
        
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Should have some results (assuming there are 2024 episodes)
        assert isinstance(results, list)
        
        # Verify all results are within date range
        for episode in results:
            episode_date = episode.publication_date.date()
            assert start_date <= episode_date <= end_date
            
    def test_date_range_results_sorted_descending(self, components):
        """Test that date range results are sorted by date descending"""
        _, rss_manager, _, _, _ = components
        
        from datetime import date
        start_date = date(2020, 1, 1)
        end_date = date(2025, 12, 31)
        
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        if len(results) > 1:
            # Verify descending order
            for i in range(len(results) - 1):
                assert results[i].publication_date >= results[i + 1].publication_date


class TestE2EGuestSearch:
    """Test search_by_guest tool"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_guest_search_case_insensitive(self, components):
        """Test that guest search is case-insensitive"""
        _, rss_manager, _, _, _ = components
        
        # Get a guest name from the feed
        episodes = rss_manager.get_cached_episodes()
        guest_episode = None
        for ep in episodes:
            if ep.guests and len(ep.guests) > 0:
                guest_episode = ep
                break
        
        if guest_episode:
            guest_name = guest_episode.guests[0].name
            
            # Search with different cases
            results_lower = rss_manager.search_by_guest(guest_name.lower())
            results_upper = rss_manager.search_by_guest(guest_name.upper())
            results_original = rss_manager.search_by_guest(guest_name)
            
            # All should return the same results
            assert len(results_lower) == len(results_upper) == len(results_original)
            
    def test_guest_search_partial_matching(self, components):
        """Test that guest search supports partial matching"""
        _, rss_manager, _, _, _ = components
        
        # Get a guest name from the feed
        episodes = rss_manager.get_cached_episodes()
        guest_episode = None
        for ep in episodes:
            if ep.guests and len(ep.guests) > 0:
                guest_episode = ep
                break
        
        if guest_episode:
            guest_name = guest_episode.guests[0].name
            
            # Search with partial name (first word)
            partial_name = guest_name.split()[0] if ' ' in guest_name else guest_name[:3]
            results = rss_manager.search_by_guest(partial_name)
            
            # Should find at least the original episode
            assert len(results) > 0
            assert any(ep.id == guest_episode.id for ep in results)


class TestE2ESearchRouter:
    """Test search router and query routing logic"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_router_detects_episode_id_pattern(self, components):
        """Test that router detects episode ID patterns"""
        _, rss_manager, _, _, search_router = components
        
        # Get a valid episode ID
        episodes = rss_manager.get_cached_episodes()
        test_id = episodes[0].id
        
        # Test various episode ID patterns
        queries = [
            f"episode {test_id}",
            f"#{test_id}",
            f"ep{test_id}",
            f"Episode {test_id}"
        ]
        
        for query in queries:
            query_type = search_router._detect_query_type(query)
            assert query_type.value == "episode_id", f"Failed to detect episode ID in: {query}"
            
    def test_router_detects_date_pattern(self, components):
        """Test that router detects date patterns"""
        _, _, _, _, search_router = components
        
        queries = [
            "2024-01-01 to 2024-12-31",
            "from 2024-01-01 to 2024-12-31",
            "between 2024-01-01 and 2024-12-31"
        ]
        
        for query in queries:
            query_type = search_router._detect_query_type(query)
            assert query_type.value == "date_range", f"Failed to detect date range in: {query}"
            
    def test_router_detects_guest_pattern(self, components):
        """Test that router detects guest name patterns"""
        _, _, _, _, search_router = components
        
        queries = [
            "with John Doe",
            "featuring Jane Smith",
            "guest Bob Johnson"
        ]
        
        for query in queries:
            query_type = search_router._detect_query_type(query)
            assert query_type.value == "guest_name", f"Failed to detect guest name in: {query}"
            
    def test_router_defaults_to_semantic(self, components):
        """Test that router defaults to semantic search for natural language"""
        _, _, _, _, search_router = components
        
        queries = [
            "machine learning on AWS",
            "serverless architecture best practices",
            "how to optimize costs"
        ]
        
        for query in queries:
            query_type = search_router._detect_query_type(query)
            assert query_type.value == "semantic", f"Failed to default to semantic for: {query}"


class TestE2EResponseFormats:
    """Test response format consistency"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_episode_response_has_required_fields(self, components):
        """Test that episode responses have all required fields"""
        _, rss_manager, _, _, _ = components
        
        episodes = rss_manager.get_cached_episodes()
        episode = episodes[0]
        
        # Convert to dict (as tools would return)
        episode_dict = episode.to_dict()
        
        # Verify required fields
        required_fields = [
            'episode_id', 'title', 'description', 'publication_date',
            'duration', 'url', 'file_size', 'guests', 'links'
        ]
        
        for field in required_fields:
            assert field in episode_dict, f"Missing required field: {field}"
            
    def test_guest_response_has_required_fields(self, components):
        """Test that guest objects have required fields"""
        _, rss_manager, _, _, _ = components
        
        episodes = rss_manager.get_cached_episodes()
        
        # Find episode with guests
        for episode in episodes:
            if episode.guests and len(episode.guests) > 0:
                guest_dict = episode.guests[0].to_dict()
                
                # Verify required fields
                assert 'name' in guest_dict
                assert 'title' in guest_dict
                assert 'linkedin_url' in guest_dict
                break


class TestE2EErrorHandling:
    """Test error handling across all tools"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_invalid_episode_id_returns_none(self, components):
        """Test that invalid episode IDs are handled gracefully"""
        _, rss_manager, _, _, _ = components
        
        # Test with various invalid IDs
        invalid_ids = [-1, 0, 999999]
        
        for invalid_id in invalid_ids:
            result = rss_manager.search_by_id(invalid_id)
            assert result is None
            
    def test_invalid_date_range_handled(self, components):
        """Test that invalid date ranges are handled"""
        _, rss_manager, _, _, _ = components
        
        from datetime import date
        
        # Start date after end date
        start_date = date(2024, 12, 31)
        end_date = date(2024, 1, 1)
        
        # Should return empty list (validation happens at tool level)
        results = rss_manager.search_by_date_range(start_date, end_date)
        assert isinstance(results, list)
        assert len(results) == 0
        
    def test_empty_guest_search_returns_empty_list(self, components):
        """Test that searching for non-existent guest returns empty list"""
        _, rss_manager, _, _, _ = components
        
        results = rss_manager.search_by_guest("NonExistentGuestXYZ123")
        
        assert isinstance(results, list)
        assert len(results) == 0


class TestE2EAWSIntegration:
    """Test AWS integration and authentication"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_aws_credentials_valid(self, components):
        """Test that AWS credentials are valid"""
        _, _, aws_client, _, _ = components
        
        # Verify credentials
        is_valid = aws_client.verify_credentials()
        assert is_valid, "AWS credentials should be valid"
        
    def test_bedrock_client_created(self, components):
        """Test that Bedrock client can be created"""
        _, _, aws_client, _, _ = components
        
        bedrock_client = aws_client.get_bedrock_client()
        assert bedrock_client is not None


class TestE2EPerformance:
    """Test performance characteristics"""
    
    @pytest.fixture
    def components(self):
        """Initialize server components"""
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        set_components(config, rss_manager, aws_client, semantic_engine, search_router)
        return config, rss_manager, aws_client, semantic_engine, search_router
    
    def test_rss_cache_improves_performance(self, components):
        """Test that RSS caching improves performance"""
        import time
        _, rss_manager, _, _, _ = components
        
        # First call (may fetch from network)
        start = time.time()
        episodes1 = rss_manager.get_cached_episodes()
        first_call_time = time.time() - start
        
        # Second call (should use cache)
        start = time.time()
        episodes2 = rss_manager.get_cached_episodes()
        second_call_time = time.time() - start
        
        # Cache should be faster (or at least not slower)
        assert second_call_time <= first_call_time * 1.5  # Allow 50% margin
        
        # Results should be identical
        assert len(episodes1) == len(episodes2)
        
    def test_episode_id_search_fast(self, components):
        """Test that episode ID search is fast (< 100ms)"""
        import time
        _, rss_manager, _, _, _ = components
        
        # Get a valid episode ID
        episodes = rss_manager.get_cached_episodes()
        test_id = episodes[0].id
        
        # Measure search time
        start = time.time()
        result = rss_manager.search_by_id(test_id)
        search_time = time.time() - start
        
        assert result is not None
        assert search_time < 0.1, f"Episode ID search took {search_time:.3f}s, should be < 0.1s"


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
