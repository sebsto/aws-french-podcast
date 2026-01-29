"""
Property-based tests for Query Routing.

Feature: podcast-search-mcp-server
Tests correctness properties of query routing functionality.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from datetime import datetime, date
from typing import List, Dict, Any
import xml.etree.ElementTree as ET
import asyncio

# Import the components
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.search.router import SearchRouter, QueryType
from src.rss.feed_manager import RSSFeedManager
from src.search.semantic import SemanticSearchEngine
from src.aws.client_manager import AWSClientManager
from src.models.episode import Episode, Guest, Link


# Helper function to generate valid RSS XML (reused from other tests)
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


def create_test_episodes() -> List[Dict[str, Any]]:
    """Create a set of test episodes for routing tests."""
    return [
        {
            'episode_id': 341,
            'title': 'Episode 341: Serverless Computing',
            'description': 'Discussion about serverless',
            'pub_date': 'Mon, 15 Jan 2024 10:00:00 +0000',
            'duration': '00:45:30',
            'url': 'https://example.com/episodes/341.mp3',
            'file_size': 5000000,
            'guests': [{'name': 'John Doe', 'title': 'Engineer', 'linkedin_url': 'https://linkedin.com/in/johndoe'}],
            'links': []
        },
        {
            'episode_id': 342,
            'title': 'Episode 342: Machine Learning',
            'description': 'ML discussion',
            'pub_date': 'Mon, 22 Jan 2024 10:00:00 +0000',
            'duration': '00:50:00',
            'url': 'https://example.com/episodes/342.mp3',
            'file_size': 6000000,
            'guests': [{'name': 'Jane Smith', 'title': 'Data Scientist', 'linkedin_url': 'https://linkedin.com/in/janesmith'}],
            'links': []
        },
        {
            'episode_id': 343,
            'title': 'Episode 343: Cloud Security',
            'description': 'Security best practices',
            'pub_date': 'Mon, 29 Jan 2024 10:00:00 +0000',
            'duration': '00:40:00',
            'url': 'https://example.com/episodes/343.mp3',
            'file_size': 4500000,
            'guests': [],
            'links': []
        }
    ]


def create_search_router() -> SearchRouter:
    """Create a SearchRouter instance with test data."""
    import tempfile
    
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


# Feature: podcast-search-mcp-server, Property 15: Query Routing by Episode ID Pattern
@given(
    episode_id=st.integers(min_value=1, max_value=1000),
    pattern=st.sampled_from(['episode {}', 'ep {}', '#{}', 'episode #{}', 'Episode {}', 'EP {}'])
)
@settings(max_examples=100, deadline=None)
def test_query_routing_by_episode_id_pattern(episode_id: int, pattern: str):
    """
    Property 15: Query Routing by Episode ID Pattern
    
    For any query string containing an episode ID pattern (e.g., "episode 341",
    "#341", "ep341"), when passed to the router's _detect_query_type method,
    the router should detect it as QueryType.EPISODE_ID.
    
    Validates: Requirements 7.2
    """
    # Create search router
    search_router = create_search_router()
    
    # Format query with episode ID
    query = pattern.format(episode_id)
    
    # Detect query type
    detected_type = search_router._detect_query_type(query)
    
    # Verify it was detected as EPISODE_ID (Requirement 7.2)
    assert detected_type == QueryType.EPISODE_ID, \
        f"Query '{query}' should be detected as EPISODE_ID, but was detected as {detected_type.value}"


# Feature: podcast-search-mcp-server, Property 16: Query Routing by Date Pattern
@given(
    year=st.integers(min_value=2020, max_value=2025),
    month=st.integers(min_value=1, max_value=12),
    day=st.integers(min_value=1, max_value=28),  # Use 28 to avoid invalid dates
    pattern_type=st.sampled_from(['range', 'single', 'month', 'year'])
)
@settings(max_examples=100, deadline=None)
def test_query_routing_by_date_pattern(year: int, month: int, day: int, pattern_type: str):
    """
    Property 16: Query Routing by Date Pattern
    
    For any query string containing date patterns or ranges (e.g.,
    "2024-01-01 to 2024-12-31", "January 2024"), when passed to the router's
    _detect_query_type method, the router should detect it as QueryType.DATE_RANGE.
    
    Validates: Requirements 7.3
    """
    # Create search router
    search_router = create_search_router()
    
    # Generate query based on pattern type
    if pattern_type == 'range':
        # Date range pattern
        start_date = f"{year}-{month:02d}-{day:02d}"
        end_month = month + 1 if month < 12 else 1
        end_year = year if month < 12 else year + 1
        end_date = f"{end_year}-{end_month:02d}-{day:02d}"
        query = f"{start_date} to {end_date}"
    elif pattern_type == 'single':
        # Single date pattern
        query = f"{year}-{month:02d}-{day:02d}"
    elif pattern_type == 'month':
        # Month name pattern
        month_names = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
        query = f"{month_names[month - 1]} {year}"
    else:  # year
        # Year pattern
        query = f"in {year}"
    
    # Detect query type
    detected_type = search_router._detect_query_type(query)
    
    # Verify it was detected as DATE_RANGE (Requirement 7.3)
    assert detected_type == QueryType.DATE_RANGE, \
        f"Query '{query}' should be detected as DATE_RANGE, but was detected as {detected_type.value}"


# Feature: podcast-search-mcp-server, Property 17: Query Routing by Guest Indicator
@given(
    guest_name=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Ll', 'Lu'), min_codepoint=65)),
    indicator=st.sampled_from(['with', 'featuring', 'guest', 'by', 'With', 'Featuring', 'Guest', 'By'])
)
@settings(max_examples=100, deadline=None)
def test_query_routing_by_guest_indicator(guest_name: str, indicator: str):
    """
    Property 17: Query Routing by Guest Indicator
    
    For any query string containing guest name indicators (e.g., "with [name]",
    "featuring [name]", "guest [name]"), when passed to the router's
    _detect_query_type method, the router should detect it as QueryType.GUEST_NAME.
    
    Validates: Requirements 7.4
    """
    # Create search router
    search_router = create_search_router()
    
    # Format query with guest indicator
    query = f"{indicator} {guest_name}"
    
    # Detect query type
    detected_type = search_router._detect_query_type(query)
    
    # Verify it was detected as GUEST_NAME (Requirement 7.4)
    assert detected_type == QueryType.GUEST_NAME, \
        f"Query '{query}' should be detected as GUEST_NAME, but was detected as {detected_type.value}"


# Feature: podcast-search-mcp-server, Property 18: Query Routing Default to Semantic
@given(
    query=st.text(
        min_size=5,
        max_size=100,
        alphabet=st.characters(whitelist_categories=('Ll', 'Lu', 'Zs'), min_codepoint=65)
    ).filter(
        # Filter out queries that match other patterns
        lambda q: not any([
            'episode' in q.lower(),
            'ep ' in q.lower(),
            '#' in q,
            'with ' in q.lower(),
            'featuring' in q.lower(),
            'guest ' in q.lower(),
            'by ' in q.lower(),
            any(month in q.lower() for month in ['january', 'february', 'march', 'april', 'may', 'june',
                                                   'july', 'august', 'september', 'october', 'november', 'december']),
            'in 20' in q.lower(),
            any(c.isdigit() for c in q)  # No digits at all
        ])
    )
)
@settings(max_examples=100, deadline=None)
def test_query_routing_default_to_semantic(query: str):
    """
    Property 18: Query Routing Default to Semantic
    
    For any natural language query without specific patterns (episode ID, date,
    or guest indicators), when passed to the router's _detect_query_type method,
    the router should default to QueryType.SEMANTIC.
    
    Validates: Requirements 7.5
    """
    # Skip empty or whitespace-only queries
    assume(query.strip())
    
    # Create search router
    search_router = create_search_router()
    
    # Detect query type
    detected_type = search_router._detect_query_type(query)
    
    # Verify it was detected as SEMANTIC (Requirement 7.5)
    assert detected_type == QueryType.SEMANTIC, \
        f"Query '{query}' should be detected as SEMANTIC (default), but was detected as {detected_type.value}"


# Feature: podcast-search-mcp-server, Property 19: Deterministic Search Priority
@given(
    episode_id=st.integers(min_value=1, max_value=1000),
    year=st.integers(min_value=2020, max_value=2025)
)
@settings(max_examples=100, deadline=None)
def test_deterministic_search_priority(episode_id: int, year: int):
    """
    Property 19: Deterministic Search Priority
    
    For any query that matches multiple search patterns (e.g., contains both
    an episode ID and a date), when passed to the router's _detect_query_type
    method, the router should prioritize deterministic searches in the order:
    Episode ID > Date Range > Guest Name > Semantic.
    
    This test verifies that episode ID patterns take priority over date patterns.
    
    Validates: Requirements 7.6
    """
    # Create search router
    search_router = create_search_router()
    
    # Create query with both episode ID and date patterns
    # Episode ID should take priority
    query = f"episode {episode_id} from {year}"
    
    # Detect query type
    detected_type = search_router._detect_query_type(query)
    
    # Verify it was detected as EPISODE_ID (priority over DATE_RANGE) (Requirement 7.6)
    assert detected_type == QueryType.EPISODE_ID, \
        f"Query '{query}' contains both episode ID and date, should prioritize EPISODE_ID, but was detected as {detected_type.value}"


# Additional edge case tests

def test_query_routing_case_insensitivity():
    """
    Test that query routing is case-insensitive.
    
    Edge case: Queries with different cases should be detected correctly.
    """
    search_router = create_search_router()
    
    # Test episode ID patterns with different cases
    queries = [
        "EPISODE 341",
        "Episode 341",
        "episode 341",
        "EP 341",
        "ep 341"
    ]
    
    for query in queries:
        detected_type = search_router._detect_query_type(query)
        assert detected_type == QueryType.EPISODE_ID, \
            f"Query '{query}' should be detected as EPISODE_ID regardless of case"


def test_query_routing_with_extra_text():
    """
    Test that query routing works with extra text around patterns.
    
    Edge case: Queries with additional context should still detect patterns.
    """
    search_router = create_search_router()
    
    # Episode ID with extra text
    query = "I want to find episode 341 about serverless"
    detected_type = search_router._detect_query_type(query)
    assert detected_type == QueryType.EPISODE_ID, \
        f"Query '{query}' should detect episode ID pattern"
    
    # Guest name with extra text
    query = "Show me episodes with John Doe talking about AWS"
    detected_type = search_router._detect_query_type(query)
    assert detected_type == QueryType.GUEST_NAME, \
        f"Query '{query}' should detect guest name pattern"
    
    # Date with extra text
    query = "Find episodes from January 2024 about containers"
    detected_type = search_router._detect_query_type(query)
    assert detected_type == QueryType.DATE_RANGE, \
        f"Query '{query}' should detect date pattern"


def test_query_routing_empty_query():
    """
    Test that empty queries default to semantic search.
    
    Edge case: Empty or whitespace-only queries.
    """
    search_router = create_search_router()
    
    # Empty query
    detected_type = search_router._detect_query_type("")
    assert detected_type == QueryType.SEMANTIC, \
        "Empty query should default to SEMANTIC"
    
    # Whitespace-only query
    detected_type = search_router._detect_query_type("   ")
    assert detected_type == QueryType.SEMANTIC, \
        "Whitespace-only query should default to SEMANTIC"


@pytest.mark.asyncio
async def test_route_query_with_hint():
    """
    Test that route_query respects the search_type hint parameter.
    
    Edge case: Explicit search type hint should override auto-detection.
    """
    search_router = create_search_router()
    
    # Query that looks like episode ID but with semantic hint
    query = "episode 341"
    result = await search_router.route_query(query, search_type="semantic")
    
    # Should attempt semantic search (will fail since no semantic engine)
    assert result['status'] == 'error', \
        "Should attempt semantic search when hint is provided"
    assert result['error_type'] == 'ConfigurationError', \
        "Should fail with configuration error (no semantic engine)"


@pytest.mark.asyncio
async def test_route_query_episode_id_found():
    """
    Test that route_query successfully finds an episode by ID.
    
    Integration test: Full routing flow for episode ID search.
    """
    search_router = create_search_router()
    
    # Query for episode 341 (exists in test data)
    query = "episode 341"
    result = await search_router.route_query(query)
    
    # Should find the episode
    assert result['status'] == 'success', \
        f"Should successfully find episode 341, got: {result}"
    assert result['count'] == 1, \
        "Should return exactly 1 episode"
    assert result['search_type'] == 'episode_id', \
        "Should indicate episode_id search was used"
    assert result['results'][0]['episode_id'] == 341, \
        "Should return episode 341"


@pytest.mark.asyncio
async def test_route_query_episode_id_not_found():
    """
    Test that route_query handles non-existent episode IDs.
    
    Integration test: Full routing flow for non-existent episode.
    """
    search_router = create_search_router()
    
    # Query for episode 999 (does not exist in test data)
    query = "episode 999"
    result = await search_router.route_query(query)
    
    # Should return error
    assert result['status'] == 'error', \
        "Should return error for non-existent episode"
    assert result['error_type'] == 'NotFoundError', \
        "Should indicate episode was not found"


@pytest.mark.asyncio
async def test_route_query_date_range():
    """
    Test that route_query successfully searches by date range.
    
    Integration test: Full routing flow for date range search.
    """
    search_router = create_search_router()
    
    # Query for January 2024 (all test episodes are in January 2024)
    query = "January 2024"
    result = await search_router.route_query(query)
    
    # Should find episodes
    assert result['status'] == 'success', \
        f"Should successfully search by date, got: {result}"
    assert result['count'] >= 1, \
        "Should return at least 1 episode from January 2024"
    assert result['search_type'] == 'date_range', \
        "Should indicate date_range search was used"


@pytest.mark.asyncio
async def test_route_query_guest_name():
    """
    Test that route_query successfully searches by guest name.
    
    Integration test: Full routing flow for guest name search.
    """
    search_router = create_search_router()
    
    # Query for guest "John Doe" (exists in test data)
    query = "with John Doe"
    result = await search_router.route_query(query)
    
    # Should find episodes
    assert result['status'] == 'success', \
        f"Should successfully search by guest, got: {result}"
    assert result['count'] >= 1, \
        "Should return at least 1 episode with John Doe"
    assert result['search_type'] == 'guest_name', \
        "Should indicate guest_name search was used"
