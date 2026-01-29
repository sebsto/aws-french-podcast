"""
Property-based tests for Semantic Search Engine.

Feature: podcast-search-mcp-server
Tests correctness properties of semantic search functionality.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import Mock, MagicMock
from typing import List, Dict, Any
import asyncio

# Import the components
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.search.semantic import SemanticSearchEngine
from src.models.search_result import SemanticResult
from src.aws.client_manager import AWSClientManager


# Hypothesis strategies for generating semantic search data

@st.composite
def bedrock_result_strategy(draw):
    """Generate a Bedrock retrieval result."""
    episode_id = draw(st.integers(min_value=1, max_value=1000))
    title = draw(st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    text = draw(st.text(min_size=10, max_size=1000, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    score = draw(st.floats(min_value=0.0, max_value=1.0))
    
    return {
        'content': {'text': text},
        'score': score,
        'metadata': {
            'episode_id': str(episode_id),
            'title': title
        }
    }


@st.composite
def bedrock_response_strategy(draw, max_results: int):
    """Generate a Bedrock retrieve API response."""
    # Generate between 0 and max_results results
    num_results = draw(st.integers(min_value=0, max_value=max_results * 2))  # Can exceed max_results
    results = draw(st.lists(bedrock_result_strategy(), min_size=num_results, max_size=num_results))
    
    return {
        'retrievalResults': results
    }


# Feature: podcast-search-mcp-server, Property 13: Semantic Search Result Limit
@given(
    max_results=st.integers(min_value=1, max_value=20),
    num_bedrock_results=st.integers(min_value=0, max_value=50)
)
@settings(max_examples=100, deadline=None)
def test_semantic_search_result_limit(max_results: int, num_bedrock_results: int):
    """
    Property 13: Semantic Search Result Limit
    
    For any semantic search query, regardless of the number of matching episodes
    in the Knowledge Base, the server should return a maximum of max_results results.
    
    This property verifies that the SemanticSearchEngine respects the max_results
    configuration and never returns more results than specified, even if Bedrock
    returns more results.
    
    Validates: Requirements 6.6
    """
    # Create mock AWS client
    mock_aws_client = Mock(spec=AWSClientManager)
    mock_bedrock_client = Mock()
    
    # Generate Bedrock results with unique episode IDs
    bedrock_results = []
    for i in range(num_bedrock_results):
        bedrock_results.append({
            'content': {'text': f'Episode content {i}'},
            'score': 0.9 - (i * 0.01),  # Decreasing scores
            'metadata': {
                'episode_id': str(i + 1),
                'title': f'Episode {i + 1}'
            }
        })
    
    # Mock Bedrock response
    mock_bedrock_client.retrieve.return_value = {
        'retrievalResults': bedrock_results
    }
    mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
    
    # Create semantic search engine with specified max_results
    engine = SemanticSearchEngine(
        aws_client=mock_aws_client,
        kb_id="test-kb-id",
        max_results=max_results
    )
    
    # Perform search
    async def run_search():
        return await engine.search("test query")
    
    results = asyncio.run(run_search())
    
    # Verify result limit (Requirement 6.6)
    # The engine should return at most max_results, but could return fewer if:
    # 1. Bedrock returned fewer results
    # 2. Some results were filtered out (e.g., missing episode IDs)
    assert len(results) <= max_results, \
        f"Should return at most {max_results} results, but returned {len(results)}"
    
    # If Bedrock returned results, verify we got some results (unless all were filtered)
    if num_bedrock_results > 0:
        # We should get min(num_bedrock_results, max_results) results
        expected_count = min(num_bedrock_results, max_results)
        assert len(results) == expected_count, \
            f"Expected {expected_count} results, but got {len(results)}"
    else:
        # If Bedrock returned no results, we should get no results
        assert len(results) == 0, \
            f"Expected 0 results when Bedrock returns nothing, but got {len(results)}"
    
    # Verify that the retrieve call was made with correct max_results
    if mock_bedrock_client.retrieve.called:
        call_args = mock_bedrock_client.retrieve.call_args
        retrieval_config = call_args[1]['retrievalConfiguration']
        vector_config = retrieval_config['vectorSearchConfiguration']
        assert vector_config['numberOfResults'] == max_results, \
            f"Should request {max_results} results from Bedrock"


# Feature: podcast-search-mcp-server, Property 14: Semantic Search Relevance Scores
@given(
    results_data=st.lists(
        st.tuples(
            st.integers(min_value=1, max_value=1000),  # episode_id
            st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))),  # title
            st.text(min_size=10, max_size=1000, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))),  # text
            st.floats(min_value=0.0, max_value=1.0)  # score
        ),
        min_size=1,
        max_size=10
    )
)
@settings(max_examples=100, deadline=None)
def test_semantic_search_relevance_scores(results_data: List[tuple]):
    """
    Property 14: Semantic Search Relevance Scores
    
    For any semantic search result, each returned episode should include a
    relevance score between 0.0 and 1.0 indicating the match quality.
    
    This property verifies that:
    1. All results have a relevance_score field
    2. All scores are in the valid range [0.0, 1.0]
    3. Scores are preserved from Bedrock's response
    
    Validates: Requirements 6.4, 9.5
    """
    # Ensure unique episode IDs
    seen_ids = set()
    unique_results = []
    for episode_id, title, text, score in results_data:
        if episode_id not in seen_ids:
            seen_ids.add(episode_id)
            unique_results.append((episode_id, title, text, score))
    
    assume(len(unique_results) > 0)
    
    # Create mock AWS client
    mock_aws_client = Mock(spec=AWSClientManager)
    mock_bedrock_client = Mock()
    
    # Generate Bedrock results from test data
    bedrock_results = []
    for episode_id, title, text, score in unique_results:
        bedrock_results.append({
            'content': {'text': text},
            'score': score,
            'metadata': {
                'episode_id': str(episode_id),
                'title': title
            }
        })
    
    # Mock Bedrock response
    mock_bedrock_client.retrieve.return_value = {
        'retrievalResults': bedrock_results
    }
    mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
    
    # Create semantic search engine
    engine = SemanticSearchEngine(
        aws_client=mock_aws_client,
        kb_id="test-kb-id",
        max_results=10
    )
    
    # Perform search
    async def run_search():
        return await engine.search("test query")
    
    results = asyncio.run(run_search())
    
    # Verify all results have relevance scores (Requirement 6.4, 9.5)
    assert len(results) == len(unique_results), \
        f"Expected {len(unique_results)} results, got {len(results)}"
    
    for i, result in enumerate(results):
        # Verify relevance_score field exists
        assert hasattr(result, 'relevance_score'), \
            f"Result {i} missing relevance_score field"
        
        # Verify score is a float
        assert isinstance(result.relevance_score, float), \
            f"Result {i} relevance_score should be float, got {type(result.relevance_score)}"
        
        # Verify score is in valid range [0.0, 1.0] (Requirement 6.4)
        assert 0.0 <= result.relevance_score <= 1.0, \
            f"Result {i} relevance_score {result.relevance_score} not in range [0.0, 1.0]"
        
        # Verify score matches the original Bedrock score
        original_episode_id = result.episode_id
        original_score = None
        for ep_id, _, _, score in unique_results:
            if ep_id == original_episode_id:
                original_score = score
                break
        
        assert original_score is not None, \
            f"Could not find original score for episode {original_episode_id}"
        
        assert result.relevance_score == original_score, \
            f"Result {i} relevance_score {result.relevance_score} does not match original {original_score}"


# Additional property tests for edge cases

@given(max_results=st.integers(min_value=1, max_value=20))
@settings(max_examples=50, deadline=None)
def test_semantic_search_empty_results_have_no_scores(max_results: int):
    """
    Test that when Bedrock returns no results, the engine returns an empty list.
    
    Edge case: Empty result set should have no relevance scores to validate.
    """
    # Create mock AWS client
    mock_aws_client = Mock(spec=AWSClientManager)
    mock_bedrock_client = Mock()
    
    # Mock empty Bedrock response
    mock_bedrock_client.retrieve.return_value = {
        'retrievalResults': []
    }
    mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
    
    # Create semantic search engine
    engine = SemanticSearchEngine(
        aws_client=mock_aws_client,
        kb_id="test-kb-id",
        max_results=max_results
    )
    
    # Perform search
    async def run_search():
        return await engine.search("test query")
    
    results = asyncio.run(run_search())
    
    # Verify empty results
    assert len(results) == 0, \
        "Empty Bedrock response should return empty results list"


@given(
    max_results=st.integers(min_value=5, max_value=20),
    num_results_without_ids=st.integers(min_value=1, max_value=10)
)
@settings(max_examples=50, deadline=None)
def test_semantic_search_filters_results_without_episode_ids(
    max_results: int,
    num_results_without_ids: int
):
    """
    Test that results without episode IDs are filtered out and don't count
    toward the result limit.
    
    Edge case: Bedrock returns results but some lack episode IDs.
    """
    # Create mock AWS client
    mock_aws_client = Mock(spec=AWSClientManager)
    mock_bedrock_client = Mock()
    
    # Generate results without episode IDs
    bedrock_results = []
    for i in range(num_results_without_ids):
        bedrock_results.append({
            'content': {'text': f'Content without ID {i}'},
            'score': 0.8,
            'metadata': {
                'title': f'Episode {i}'
                # Missing episode_id
            }
        })
    
    # Mock Bedrock response
    mock_bedrock_client.retrieve.return_value = {
        'retrievalResults': bedrock_results
    }
    mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
    
    # Create semantic search engine
    engine = SemanticSearchEngine(
        aws_client=mock_aws_client,
        kb_id="test-kb-id",
        max_results=max_results
    )
    
    # Perform search
    async def run_search():
        return await engine.search("test query")
    
    results = asyncio.run(run_search())
    
    # Verify all results without episode IDs are filtered out
    assert len(results) == 0, \
        "Results without episode IDs should be filtered out"


@given(
    scores=st.lists(
        st.floats(min_value=0.0, max_value=1.0),
        min_size=2,
        max_size=10
    )
)
@settings(max_examples=50, deadline=None)
def test_semantic_search_preserves_score_ordering(scores: List[float]):
    """
    Test that relevance scores are preserved in the order returned by Bedrock.
    
    This verifies that the engine doesn't reorder or modify scores.
    """
    # Ensure we have at least 2 different scores
    assume(len(set(scores)) >= 2)
    
    # Create mock AWS client
    mock_aws_client = Mock(spec=AWSClientManager)
    mock_bedrock_client = Mock()
    
    # Generate Bedrock results with specified scores
    bedrock_results = []
    for i, score in enumerate(scores):
        bedrock_results.append({
            'content': {'text': f'Content {i}'},
            'score': score,
            'metadata': {
                'episode_id': str(i + 1),
                'title': f'Episode {i + 1}'
            }
        })
    
    # Mock Bedrock response
    mock_bedrock_client.retrieve.return_value = {
        'retrievalResults': bedrock_results
    }
    mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
    
    # Create semantic search engine
    engine = SemanticSearchEngine(
        aws_client=mock_aws_client,
        kb_id="test-kb-id",
        max_results=len(scores)
    )
    
    # Perform search
    async def run_search():
        return await engine.search("test query")
    
    results = asyncio.run(run_search())
    
    # Verify scores are preserved in order
    assert len(results) == len(scores), \
        f"Expected {len(scores)} results, got {len(results)}"
    
    for i, (result, expected_score) in enumerate(zip(results, scores)):
        assert result.relevance_score == expected_score, \
            f"Result {i} score {result.relevance_score} does not match expected {expected_score}"


def test_semantic_search_score_boundary_values():
    """
    Test that boundary values (0.0 and 1.0) for relevance scores are handled correctly.
    
    Edge case: Minimum and maximum possible relevance scores.
    """
    # Create mock AWS client
    mock_aws_client = Mock(spec=AWSClientManager)
    mock_bedrock_client = Mock()
    
    # Generate results with boundary scores
    bedrock_results = [
        {
            'content': {'text': 'Perfect match'},
            'score': 1.0,
            'metadata': {
                'episode_id': '1',
                'title': 'Episode 1'
            }
        },
        {
            'content': {'text': 'No match'},
            'score': 0.0,
            'metadata': {
                'episode_id': '2',
                'title': 'Episode 2'
            }
        }
    ]
    
    # Mock Bedrock response
    mock_bedrock_client.retrieve.return_value = {
        'retrievalResults': bedrock_results
    }
    mock_aws_client.get_bedrock_client.return_value = mock_bedrock_client
    
    # Create semantic search engine
    engine = SemanticSearchEngine(
        aws_client=mock_aws_client,
        kb_id="test-kb-id",
        max_results=10
    )
    
    # Perform search
    async def run_search():
        return await engine.search("test query")
    
    results = asyncio.run(run_search())
    
    # Verify boundary scores are preserved
    assert len(results) == 2, "Should return 2 results"
    
    assert results[0].relevance_score == 1.0, \
        "First result should have score 1.0"
    assert results[1].relevance_score == 0.0, \
        "Second result should have score 0.0"
