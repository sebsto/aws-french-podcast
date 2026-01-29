"""
Unit tests for SemanticSearchEngine class.

Tests Bedrock API integration, error handling, and result enrichment.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError
import asyncio

import sys
import os

# Add parent directory to path to import the server module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.search.semantic import SemanticSearchEngine
from src.models.search_result import SemanticResult
from src.aws.client_manager import AWSClientManager


class TestSemanticSearchEngineInitialization:
    """Test Semantic Search Engine initialization."""
    
    def test_initialization(self):
        """Test successful initialization with required parameters."""
        mock_aws_client = Mock(spec=AWSClientManager)
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        assert engine.aws_client == mock_aws_client
        assert engine.kb_id == "test-kb-id"
        assert engine.max_results == 10
        assert engine._cache_ttl == 300  # 5 minutes
        assert len(engine._cache) == 0


class TestSemanticSearchBedrockAPIFailure:
    """Test Bedrock API failure handling."""
    
    @pytest.mark.asyncio
    async def test_bedrock_api_access_denied(self):
        """Test handling of Bedrock API access denied error."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate access denied error
        error_response = {
            "Error": {
                "Code": "AccessDeniedException",
                "Message": "User is not authorized to perform: bedrock:Retrieve"
            }
        }
        mock_bedrock_client.retrieve.side_effect = ClientError(
            error_response,
            "Retrieve"
        )
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        with pytest.raises(RuntimeError) as exc_info:
            await engine.search("test query")
        
        assert "Semantic search failed" in str(exc_info.value)
        assert "AccessDeniedException" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_bedrock_api_resource_not_found(self):
        """Test handling of Knowledge Base not found error."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate resource not found error
        error_response = {
            "Error": {
                "Code": "ResourceNotFoundException",
                "Message": "Knowledge Base not found"
            }
        }
        mock_bedrock_client.retrieve.side_effect = ClientError(
            error_response,
            "Retrieve"
        )
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="invalid-kb-id",
            max_results=10
        )
        
        with pytest.raises(RuntimeError) as exc_info:
            await engine.search("test query")
        
        assert "Semantic search failed" in str(exc_info.value)
        assert "ResourceNotFoundException" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_bedrock_api_throttling(self):
        """Test handling of Bedrock API throttling error."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate throttling error
        error_response = {
            "Error": {
                "Code": "ThrottlingException",
                "Message": "Rate exceeded"
            }
        }
        mock_bedrock_client.retrieve.side_effect = ClientError(
            error_response,
            "Retrieve"
        )
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        with pytest.raises(RuntimeError) as exc_info:
            await engine.search("test query")
        
        assert "Semantic search failed" in str(exc_info.value)
        assert "ThrottlingException" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_bedrock_api_validation_error(self):
        """Test handling of Bedrock API validation error."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate validation error
        error_response = {
            "Error": {
                "Code": "ValidationException",
                "Message": "Invalid request parameters"
            }
        }
        mock_bedrock_client.retrieve.side_effect = ClientError(
            error_response,
            "Retrieve"
        )
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        with pytest.raises(RuntimeError) as exc_info:
            await engine.search("test query")
        
        assert "Semantic search failed" in str(exc_info.value)
        assert "ValidationException" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_bedrock_api_unexpected_error(self):
        """Test handling of unexpected errors during Bedrock API call."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate unexpected error
        mock_bedrock_client.retrieve.side_effect = Exception("Unexpected network error")
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        with pytest.raises(RuntimeError) as exc_info:
            await engine.search("test query")
        
        assert "Semantic search failed" in str(exc_info.value)
        assert "Unexpected network error" in str(exc_info.value)


class TestSemanticSearchEmptyResults:
    """Test handling of empty search results."""
    
    @pytest.mark.asyncio
    async def test_empty_result_set(self):
        """Test handling when Bedrock returns no results."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate empty results
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': []
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        results = await engine.search("nonexistent topic")
        
        assert isinstance(results, list)
        assert len(results) == 0
    
    @pytest.mark.asyncio
    async def test_results_with_missing_episode_ids(self):
        """Test handling when results are missing episode IDs."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate results without episode IDs
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': 'Some content'},
                    'score': 0.85,
                    'metadata': {}  # Missing episode_id
                },
                {
                    'content': {'text': 'More content'},
                    'score': 0.75,
                    'metadata': {'title': 'Episode Title'}  # Missing episode_id
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        results = await engine.search("test query")
        
        # Should return empty list since all results lack episode IDs
        assert isinstance(results, list)
        assert len(results) == 0


class TestSemanticSearchResultEnrichment:
    """Test result enrichment with RSS metadata."""
    
    @pytest.mark.asyncio
    async def test_successful_result_parsing(self):
        """Test successful parsing of Bedrock results."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Simulate successful results with episode IDs
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': 'This is episode content about serverless computing.'},
                    'score': 0.92,
                    'metadata': {
                        'episode_id': '341',
                        'title': 'Serverless Episode'
                    }
                },
                {
                    'content': {'text': 'Another episode discussing AWS Lambda.'},
                    'score': 0.87,
                    'metadata': {
                        'episodeId': '340',  # Alternative field name
                        'episode_title': 'Lambda Deep Dive'
                    }
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        results = await engine.search("serverless")
        
        assert len(results) == 2
        
        # Check first result
        assert results[0].episode_id == 341
        assert results[0].title == 'Serverless Episode'
        assert 'serverless computing' in results[0].excerpt
        assert results[0].relevance_score == 0.92
        
        # Check second result
        assert results[1].episode_id == 340
        assert results[1].title == 'Lambda Deep Dive'
        assert 'AWS Lambda' in results[1].excerpt
        assert results[1].relevance_score == 0.87
    
    @pytest.mark.asyncio
    async def test_excerpt_truncation(self):
        """Test that long content is truncated to 500 characters."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        # Create long content (>500 characters)
        long_content = "A" * 600
        
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': long_content},
                    'score': 0.85,
                    'metadata': {
                        'episode_id': '100',
                        'title': 'Long Episode'
                    }
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        results = await engine.search("test")
        
        assert len(results) == 1
        assert len(results[0].excerpt) == 503  # 500 + "..."
        assert results[0].excerpt.endswith("...")
    
    @pytest.mark.asyncio
    async def test_default_title_when_missing(self):
        """Test that default title is used when metadata lacks title."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': 'Episode content'},
                    'score': 0.80,
                    'metadata': {
                        'episode_id': '250'
                        # No title field
                    }
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        results = await engine.search("test")
        
        assert len(results) == 1
        assert results[0].title == "Episode 250"  # Default title format


class TestSemanticSearchCaching:
    """Test result caching functionality."""
    
    @pytest.mark.asyncio
    async def test_cache_hit(self):
        """Test that cached results are returned without API call."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': 'Cached content'},
                    'score': 0.90,
                    'metadata': {
                        'episode_id': '100',
                        'title': 'Cached Episode'
                    }
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        # First call - should hit API
        results1 = await engine.search("test query")
        assert len(results1) == 1
        assert mock_bedrock_client.retrieve.call_count == 1
        
        # Second call with same query - should use cache
        results2 = await engine.search("test query")
        assert len(results2) == 1
        assert mock_bedrock_client.retrieve.call_count == 1  # No additional call
        
        # Results should be identical
        assert results1[0].episode_id == results2[0].episode_id
        assert results1[0].title == results2[0].title
    
    @pytest.mark.asyncio
    async def test_cache_miss_different_query(self):
        """Test that different queries don't use cached results."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': 'Content'},
                    'score': 0.85,
                    'metadata': {
                        'episode_id': '100',
                        'title': 'Episode'
                    }
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        # First query
        await engine.search("query 1")
        assert mock_bedrock_client.retrieve.call_count == 1
        
        # Different query - should hit API again
        await engine.search("query 2")
        assert mock_bedrock_client.retrieve.call_count == 2
    
    @pytest.mark.asyncio
    async def test_cache_expiration(self):
        """Test that cache expires after TTL."""
        mock_aws_client = Mock(spec=AWSClientManager)
        mock_bedrock_client = Mock()
        
        mock_bedrock_client.retrieve.return_value = {
            'retrievalResults': [
                {
                    'content': {'text': 'Content'},
                    'score': 0.85,
                    'metadata': {
                        'episode_id': '100',
                        'title': 'Episode'
                    }
                }
            ]
        }
        mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
        
        engine = SemanticSearchEngine(
            aws_client=mock_aws_client,
            kb_id="test-kb-id",
            max_results=10
        )
        
        # First call
        await engine.search("test query")
        assert mock_bedrock_client.retrieve.call_count == 1
        
        # Simulate cache expiration by manipulating timestamp
        import time
        for key in engine._cache:
            results, timestamp = engine._cache[key]
            engine._cache[key] = (results, timestamp - 400)  # Make it stale (>300s)
        
        # Second call - cache should be expired
        await engine.search("test query")
        assert mock_bedrock_client.retrieve.call_count == 2  # New API call
