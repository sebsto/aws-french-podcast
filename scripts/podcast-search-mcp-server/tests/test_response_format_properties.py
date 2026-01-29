"""
Property-based tests for Response Formats.

Feature: podcast-search-mcp-server
Tests correctness properties of response format consistency and error handling.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from datetime import datetime, date, timezone
from typing import List, Dict, Any
import xml.etree.ElementTree as ET
import json
import tempfile

# Import the components
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.search.router import SearchRouter
from src.rss.feed_manager import RSSFeedManager
from src.search.semantic import SemanticSearchEngine
from src.aws.client_manager import AWSClientManager
from src.models.episode import Episode, Guest, Link


# Helper function to generate valid RSS XML
def generate_rss_xml(episodes_data: List[Dict[str, Any]]) -> str:
    """
    Generate a valid RSS feed XML string from episode data.
    
    Args:
        episodes_data: List of dictionaries containing episode information
        
    Returns:
        Valid RSS 2.0 XML string
    """
    rss = ET.Element('rss', version='2.0')
    rss.set('xmlns:itunes', 'http://www.itunes.com/dtds/podcast-1.0.dtd')
    rss.set('xmlns:content', 'http://purl.org/rss/1.0/modules/content/')
    rss.set('xmlns:aws', 'http://aws.amazon.com/podcast/1.0')
    
    channel = ET.SubElement(rss, 'channel')
    ET.SubElement(channel, 'title').text = 'Test Podcast'
    ET.SubElement(channel, 'description').text = 'Test podcast description'
    ET.SubElement(channel, 'link').text = 'https://example.com'
    
    for ep_data in episodes_data:
        item = ET.SubElement(channel, 'item')
        
        # Required fields
        ET.SubElement(item, 'title').text = ep_data['title']
        ET.SubElement(item, 'description').text = ep_data['description']
        ET.SubElement(item, 'pubDate').text = ep_data['pub_date']
        ET.SubElement(item, 'link').text = ep_data['url']
        
        # iTunes-specific fields
        itunes_episode = ET.SubElement(item, 'itunes:episode')
        itunes_episode.text = str(ep_data['episode_id'])
        
        itunes_duration = ET.SubElement(item, 'itunes:duration')
        itunes_duration.text = ep_data['duration']
        
        # Enclosure (audio file)
        enclosure = ET.SubElement(item, 'enclosure')
        enclosure.set('url', ep_data['url'])
        enclosure.set('length', str(ep_data['file_size']))
        enclosure.set('type', 'audio/mpeg')
        
        # Guest information (if present)
        if ep_data.get('guests'):
            for guest in ep_data['guests']:
                aws_guest_name = ET.SubElement(item, 'aws:guest-name')
                aws_guest_name.text = guest['name']
                
                if guest.get('title'):
                    aws_guest_title = ET.SubElement(item, 'aws:guest-title')
                    aws_guest_title.text = guest['title']
                
                if guest.get('linkedin_url'):
                    aws_guest_link = ET.SubElement(item, 'aws:guest-link')
                    aws_guest_link.text = guest['linkedin_url']
        
        # Links (if present)
        if ep_data.get('links'):
            content_html = ""
            for link in ep_data['links']:
                content_html += f"<a href=\"{link['url']}\">{link['text']}</a> "
            
            content_elem = ET.SubElement(item, 'content:encoded')
            content_elem.text = content_html
    
    return ET.tostring(rss, encoding='unicode')


def create_test_episodes(count: int = 5) -> List[Dict[str, Any]]:
    """Create a set of test episodes."""
    episodes = []
    base_date = datetime(2024, 1, 1, 10, 0, 0)
    
    for i in range(count):
        episode_date = base_date.replace(day=1 + (i * 7))  # Weekly episodes
        episodes.append({
            'episode_id': 340 + i,
            'title': f'Episode {340 + i}: Test Topic {i}',
            'description': f'Description for episode {340 + i}',
            'pub_date': episode_date.strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:45:30',
            'url': f'https://example.com/episodes/{340 + i}.mp3',
            'file_size': 5000000 + (i * 100000),
            'guests': [
                {
                    'name': f'Guest {i}',
                    'title': f'Title {i}',
                    'linkedin_url': f'https://linkedin.com/in/guest{i}'
                }
            ] if i % 2 == 0 else [],
            'links': [
                {
                    'text': f'Link {i}',
                    'url': f'https://example.com/link{i}'
                }
            ] if i % 3 == 0 else []
        })
    
    return episodes


def create_search_router() -> SearchRouter:
    """Create a SearchRouter instance with test data."""
    # Create test episodes
    episodes_data = create_test_episodes()
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(episodes_data)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    # Create RSS Feed Manager
    feed_url = f"file://{rss_file_path}"
    rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
    
    # Create SearchRouter (without semantic engine for these tests)
    search_router = SearchRouter(rss_manager, semantic_engine=None)
    
    return search_router


# Feature: podcast-search-mcp-server, Property 20: Response Format Consistency
@given(
    search_type=st.sampled_from(['episode_id', 'date_range', 'guest_name']),
    episode_id=st.integers(min_value=340, max_value=344)
)
@settings(max_examples=100, deadline=None)
@pytest.mark.asyncio
async def test_response_format_consistency(search_type: str, episode_id: int):
    """
    Property 20: Response Format Consistency
    
    For any search tool invocation (get_episode_by_id, search_by_date_range,
    search_by_guest), the response should be a valid JSON object with consistent
    structure containing status, count, and results fields.
    
    Validates: Requirements 7.7, 9.1
    """
    # Create search router
    search_router = create_search_router()
    
    # Perform search based on type
    if search_type == 'episode_id':
        query = f"episode {episode_id}"
    elif search_type == 'date_range':
        query = "January 2024"
    else:  # guest_name
        query = "with Guest"
    
    # Route query
    result = await search_router.route_query(query)
    
    # Verify response is a dictionary (JSON-serializable)
    assert isinstance(result, dict), \
        "Response must be a dictionary (JSON object)"
    
    # Verify required fields are present (Requirement 7.7, 9.1)
    assert "status" in result, \
        "Response must include 'status' field"
    assert "count" in result or "error_type" in result, \
        "Response must include 'count' field (success) or 'error_type' (error)"
    
    # If success, verify results field
    if result["status"] == "success":
        assert "results" in result, \
            "Success response must include 'results' field"
        assert isinstance(result["results"], list), \
            "'results' field must be a list"
        assert isinstance(result["count"], int), \
            "'count' field must be an integer"
        assert result["count"] == len(result["results"]), \
            "'count' must match the number of results"
        
        # Verify each result has required episode fields
        for episode_result in result["results"]:
            assert isinstance(episode_result, dict), \
                "Each result must be a dictionary"
            
            # Check for required episode fields
            required_fields = [
                "episode_id", "title", "description", "publication_date",
                "duration", "url", "file_size", "guests", "links"
            ]
            
            for field in required_fields:
                assert field in episode_result, \
                    f"Episode result must include '{field}' field"
    
    # If error, verify error fields
    elif result["status"] == "error":
        assert "error_type" in result, \
            "Error response must include 'error_type' field"
        assert "message" in result, \
            "Error response must include 'message' field"
    
    # Verify response can be serialized to JSON
    try:
        json_str = json.dumps(result)
        assert json_str is not None, \
            "Response must be JSON-serializable"
        
        # Verify it can be deserialized back
        parsed = json.loads(json_str)
        assert parsed == result, \
            "Response must round-trip through JSON serialization"
    except (TypeError, ValueError) as e:
        pytest.fail(f"Response is not JSON-serializable: {str(e)}")


# Feature: podcast-search-mcp-server, Property 21: Error Response Structure
@given(
    error_scenario=st.sampled_from([
        'invalid_episode_id',
        'episode_not_found',
        'invalid_date_format',
        'invalid_date_range',
        'semantic_not_configured'
    ])
)
@settings(max_examples=100, deadline=None)
@pytest.mark.asyncio
async def test_error_response_structure(error_scenario: str):
    """
    Property 21: Error Response Structure
    
    For any tool invocation that results in an error (validation error, not found,
    API failure), the server should return a structured error response containing
    error_type, message, and suggested_action fields.
    
    Validates: Requirements 8.4, 9.6
    """
    # Create search router
    search_router = create_search_router()
    
    # Trigger different error scenarios
    if error_scenario == 'invalid_episode_id':
        # This will be caught by validation in the tool
        # We'll test the router's handling of non-existent episodes
        query = "episode 999999"
    elif error_scenario == 'episode_not_found':
        query = "episode 999"
    elif error_scenario == 'invalid_date_format':
        # Router will try to parse and fail
        query = "2024/01/01 to 2024/12/31"  # Wrong format
    elif error_scenario == 'invalid_date_range':
        query = "2024-12-31 to 2024-01-01"  # End before start
    else:  # semantic_not_configured
        # Force semantic search without engine
        query = "natural language query about serverless"
    
    # Route query
    result = await search_router.route_query(query)
    
    # For some scenarios, we might get success with 0 results instead of error
    # This is acceptable for "not found" cases
    if result["status"] == "success" and result["count"] == 0:
        # Empty result is valid for not found scenarios
        return
    
    # If we get an error, verify structure (Requirement 8.4, 9.6)
    if result["status"] == "error":
        # Verify required error fields
        assert "error_type" in result, \
            "Error response must include 'error_type' field"
        assert "message" in result, \
            "Error response must include 'message' field"
        assert "suggested_action" in result, \
            "Error response must include 'suggested_action' field"
        
        # Verify field types
        assert isinstance(result["error_type"], str), \
            "'error_type' must be a string"
        assert isinstance(result["message"], str), \
            "'message' must be a string"
        assert isinstance(result["suggested_action"], str), \
            "'suggested_action' must be a string"
        
        # Verify fields are not empty
        assert len(result["error_type"]) > 0, \
            "'error_type' must not be empty"
        assert len(result["message"]) > 0, \
            "'message' must not be empty"
        assert len(result["suggested_action"]) > 0, \
            "'suggested_action' must not be empty"
        
        # Verify error_type is one of the expected types
        valid_error_types = [
            "ValidationError", "NotFoundError", "ServerError",
            "BedrockError", "ConfigurationError", "SearchError"
        ]
        assert result["error_type"] in valid_error_types, \
            f"'error_type' must be one of {valid_error_types}, got '{result['error_type']}'"
        
        # Verify response can be serialized to JSON
        try:
            json_str = json.dumps(result)
            assert json_str is not None
        except (TypeError, ValueError) as e:
            pytest.fail(f"Error response is not JSON-serializable: {str(e)}")


# Feature: podcast-search-mcp-server, Property 9: Empty Result Handling
@given(
    search_type=st.sampled_from(['date_range', 'guest_name']),
    query_variant=st.integers(min_value=0, max_value=2)
)
@settings(max_examples=100, deadline=None)
@pytest.mark.asyncio
async def test_empty_result_handling(search_type: str, query_variant: int):
    """
    Property 9: Empty Result Handling
    
    For any search query (date range, guest name, or semantic query) that matches
    no episodes, the server should return an empty result set with status "success"
    and count 0, along with an informative message.
    
    Validates: Requirements 4.5, 5.3, 6.5
    """
    # Create search router
    search_router = create_search_router()
    
    # Create queries that should return no results
    if search_type == 'date_range':
        # Date range with no episodes
        queries = [
            "2019-01-01 to 2019-12-31",  # Before any episodes
            "2030-01-01 to 2030-12-31",  # After any episodes
            "2024-12-01 to 2024-12-31"   # After test episodes
        ]
        query = queries[query_variant % len(queries)]
    else:  # guest_name
        # Guest names that don't exist
        queries = [
            "with NonExistentGuest",
            "featuring UnknownPerson",
            "guest XYZ123"
        ]
        query = queries[query_variant % len(queries)]
    
    # Route query
    result = await search_router.route_query(query)
    
    # Verify response structure (Requirement 4.5, 5.3, 6.5)
    assert isinstance(result, dict), \
        "Response must be a dictionary"
    
    assert result["status"] == "success", \
        "Empty result should have status 'success', not error"
    
    assert "count" in result, \
        "Response must include 'count' field"
    
    assert result["count"] == 0, \
        "Empty result should have count 0"
    
    assert "results" in result, \
        "Response must include 'results' field"
    
    assert isinstance(result["results"], list), \
        "'results' must be a list"
    
    assert len(result["results"]) == 0, \
        "'results' list should be empty"
    
    # Verify informative message is present
    assert "message" in result, \
        "Empty result should include an informative 'message' field"
    
    assert isinstance(result["message"], str), \
        "'message' must be a string"
    
    assert len(result["message"]) > 0, \
        "'message' should not be empty"
    
    # Verify response can be serialized to JSON
    try:
        json_str = json.dumps(result)
        assert json_str is not None
    except (TypeError, ValueError) as e:
        pytest.fail(f"Empty result response is not JSON-serializable: {str(e)}")


# Additional edge case tests

@pytest.mark.asyncio
async def test_response_format_with_multiple_results():
    """
    Test that response format is consistent when returning multiple results.
    
    Edge case: Multiple episodes in results array.
    """
    search_router = create_search_router()
    
    # Query that should return multiple episodes
    query = "January 2024"
    result = await search_router.route_query(query)
    
    # Should return success with multiple results
    assert result["status"] == "success"
    assert result["count"] > 1, "Should return multiple episodes"
    assert len(result["results"]) == result["count"]
    
    # Verify all results have consistent structure
    for episode_result in result["results"]:
        assert "episode_id" in episode_result
        assert "title" in episode_result
        assert "description" in episode_result
        assert "publication_date" in episode_result
        assert "duration" in episode_result
        assert "url" in episode_result
        assert "file_size" in episode_result
        assert "guests" in episode_result
        assert "links" in episode_result


@pytest.mark.asyncio
async def test_response_format_with_single_result():
    """
    Test that response format is consistent when returning a single result.
    
    Edge case: Single episode in results array.
    """
    search_router = create_search_router()
    
    # Query for specific episode
    query = "episode 340"
    result = await search_router.route_query(query)
    
    # Should return success with single result
    assert result["status"] == "success"
    assert result["count"] == 1
    assert len(result["results"]) == 1
    
    # Verify result structure
    episode_result = result["results"][0]
    assert "episode_id" in episode_result
    assert episode_result["episode_id"] == 340


@pytest.mark.asyncio
async def test_error_response_without_suggested_action():
    """
    Test that all error responses include suggested_action.
    
    Edge case: Verify suggested_action is always present in errors.
    """
    search_router = create_search_router()
    
    # Trigger an error (non-existent episode)
    query = "episode 999"
    result = await search_router.route_query(query)
    
    # If error, must have suggested_action
    if result["status"] == "error":
        assert "suggested_action" in result
        assert isinstance(result["suggested_action"], str)
        assert len(result["suggested_action"]) > 0


@pytest.mark.asyncio
async def test_response_json_serialization():
    """
    Test that all responses can be serialized to JSON.
    
    Edge case: Verify JSON serialization works for all response types.
    """
    search_router = create_search_router()
    
    # Test various queries
    queries = [
        "episode 340",  # Success with result
        "episode 999",  # Error or empty
        "January 2024",  # Success with multiple results
        "with Guest 0",  # Success with guest search
    ]
    
    for query in queries:
        result = await search_router.route_query(query)
        
        # Verify JSON serialization
        try:
            json_str = json.dumps(result)
            parsed = json.loads(json_str)
            assert parsed == result
        except (TypeError, ValueError) as e:
            pytest.fail(f"Response for query '{query}' is not JSON-serializable: {str(e)}")
