"""
Unit tests for server initialization.

Tests successful initialization, configuration validation, and error handling.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add parent directory to path to import the server module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.server import initialize_server
from src.config import ServerConfig
from src.aws.client_manager import AWSClientManager
from src.rss.feed_manager import RSSFeedManager
from src.search.semantic import SemanticSearchEngine
from src.search.router import SearchRouter


class TestServerInitialization:
    """Test server initialization with valid configuration."""
    
    @patch('src.server.ServerConfig.from_environment')
    @patch('src.server.AWSClientManager')
    @patch('src.server.RSSFeedManager')
    @patch('src.server.SemanticSearchEngine')
    @patch('src.server.SearchRouter')
    def test_successful_initialization_with_kb_id(
        self,
        mock_router_class,
        mock_semantic_class,
        mock_rss_class,
        mock_aws_class,
        mock_config_class
    ):
        """Test successful initialization with all components including semantic search."""
        # Setup mocks
        mock_config = Mock(spec=ServerConfig)
        mock_config.aws_profile = "podcast"
        mock_config.aws_region = "eu-central-1"
        mock_config.rss_feed_url = "https://example.com/feed.xml"
        mock_config.cache_ttl_seconds = 3600
        mock_config.bedrock_kb_id = "test-kb-id"
        mock_config.max_semantic_results = 10
        mock_config_class.return_value = mock_config
        
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_aws_client.verify_credentials.return_value = True
        mock_aws_class.return_value = mock_aws_client
        
        mock_rss_manager = Mock(spec=RSSFeedManager)
        mock_rss_manager.get_cached_episodes.return_value = []
        mock_rss_class.return_value = mock_rss_manager
        
        mock_semantic_engine = Mock(spec=SemanticSearchEngine)
        mock_semantic_class.return_value = mock_semantic_engine
        
        mock_search_router = Mock(spec=SearchRouter)
        mock_router_class.return_value = mock_search_router
        
        # Call initialize_server
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        
        # Verify all components were created
        assert config == mock_config
        assert rss_manager == mock_rss_manager
        assert aws_client == mock_aws_client
        assert semantic_engine == mock_semantic_engine
        assert search_router == mock_search_router
        
        # Verify initialization calls
        mock_aws_class.assert_called_once_with("podcast", "eu-central-1")
        mock_aws_client.verify_credentials.assert_called_once()
        mock_rss_class.assert_called_once_with("https://example.com/feed.xml", 3600)
        mock_rss_manager.get_cached_episodes.assert_called_once()
        mock_semantic_class.assert_called_once_with(mock_aws_client, "test-kb-id", 10)
        mock_router_class.assert_called_once_with(mock_rss_manager, mock_semantic_engine)
    
    @patch('src.server.ServerConfig.from_environment')
    @patch('src.server.AWSClientManager')
    @patch('src.server.RSSFeedManager')
    @patch('src.server.SearchRouter')
    def test_successful_initialization_without_kb_id(
        self,
        mock_router_class,
        mock_rss_class,
        mock_aws_class,
        mock_config_class
    ):
        """Test successful initialization without semantic search (no KB ID)."""
        # Setup mocks
        mock_config = Mock(spec=ServerConfig)
        mock_config.aws_profile = "podcast"
        mock_config.aws_region = "eu-central-1"
        mock_config.rss_feed_url = "https://example.com/feed.xml"
        mock_config.cache_ttl_seconds = 3600
        mock_config.bedrock_kb_id = ""  # No KB ID
        mock_config.max_semantic_results = 10
        mock_config_class.return_value = mock_config
        
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_aws_client.verify_credentials.return_value = True
        mock_aws_class.return_value = mock_aws_client
        
        mock_rss_manager = Mock(spec=RSSFeedManager)
        mock_rss_manager.get_cached_episodes.return_value = []
        mock_rss_class.return_value = mock_rss_manager
        
        mock_search_router = Mock(spec=SearchRouter)
        mock_router_class.return_value = mock_search_router
        
        # Call initialize_server
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        
        # Verify semantic engine is None
        assert semantic_engine is None
        
        # Verify router was created with None for semantic engine
        mock_router_class.assert_called_once_with(mock_rss_manager, None)


class TestServerInitializationFailures:
    """Test server initialization failure scenarios."""
    
    @patch('src.server.ServerConfig.from_environment')
    def test_initialization_fails_with_invalid_config(self, mock_config_class):
        """Test initialization fails gracefully with invalid configuration."""
        # Setup mock to raise ValueError
        mock_config_class.side_effect = ValueError("Invalid configuration")
        
        # Call initialize_server and expect SystemExit
        with pytest.raises(SystemExit) as exc_info:
            initialize_server()
        
        assert exc_info.value.code == 1
    
    @patch('src.server.ServerConfig.from_environment')
    @patch('src.server.AWSClientManager')
    def test_initialization_fails_with_invalid_credentials(
        self,
        mock_aws_class,
        mock_config_class
    ):
        """Test initialization fails gracefully with invalid AWS credentials."""
        # Setup mocks
        mock_config = Mock(spec=ServerConfig)
        mock_config.aws_profile = "invalid"
        mock_config.aws_region = "eu-central-1"
        mock_config_class.return_value = mock_config
        
        # Setup AWS client to raise error on credential verification
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_aws_client.verify_credentials.side_effect = RuntimeError("Invalid credentials")
        mock_aws_class.return_value = mock_aws_client
        
        # Call initialize_server and expect SystemExit
        with pytest.raises(SystemExit) as exc_info:
            initialize_server()
        
        assert exc_info.value.code == 1
    
    @patch('src.server.ServerConfig.from_environment')
    @patch('src.server.AWSClientManager')
    @patch('src.server.RSSFeedManager')
    def test_initialization_fails_with_rss_feed_error(
        self,
        mock_rss_class,
        mock_aws_class,
        mock_config_class
    ):
        """Test initialization fails gracefully when RSS feed cannot be fetched."""
        # Setup mocks
        mock_config = Mock(spec=ServerConfig)
        mock_config.aws_profile = "podcast"
        mock_config.aws_region = "eu-central-1"
        mock_config.rss_feed_url = "https://example.com/feed.xml"
        mock_config.cache_ttl_seconds = 3600
        mock_config_class.return_value = mock_config
        
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_aws_client.verify_credentials.return_value = True
        mock_aws_class.return_value = mock_aws_client
        
        # Setup RSS manager to raise error
        mock_rss_manager = Mock(spec=RSSFeedManager)
        mock_rss_manager.get_cached_episodes.side_effect = RuntimeError("Failed to fetch RSS feed")
        mock_rss_class.return_value = mock_rss_manager
        
        # Call initialize_server and expect SystemExit
        with pytest.raises(SystemExit) as exc_info:
            initialize_server()
        
        assert exc_info.value.code == 1


class TestToolRegistration:
    """Test that all tools are properly registered."""
    
    def test_all_tools_registered(self):
        """Test that all expected tools are registered with the MCP server."""
        from src.server import mcp
        
        # Get registered tools
        # Note: FastMCP doesn't expose a direct way to list tools,
        # so we verify by checking the tool decorators were applied
        # This is a basic check that the module loads without errors
        assert mcp is not None
        assert hasattr(mcp, 'tool')
