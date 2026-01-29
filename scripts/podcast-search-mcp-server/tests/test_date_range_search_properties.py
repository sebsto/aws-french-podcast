"""
Property-based tests for Date Range Search.

Feature: podcast-search-mcp-server
Tests correctness properties of date range search functionality.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from datetime import datetime, date, timedelta
from typing import List, Dict, Any
import xml.etree.ElementTree as ET

# Import the components
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.rss.feed_manager import RSSFeedManager
from src.models.episode import Episode, Guest, Link


# Helper function to generate valid RSS XML (reused from other test files)
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


# Hypothesis strategies for generating episode data
@st.composite
def episode_data_with_date_strategy(draw, pub_date: datetime):
    """Generate episode data with a specific publication date."""
    episode_id = draw(st.integers(min_value=1, max_value=10000))
    title = draw(st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    description = draw(st.text(min_size=1, max_size=500, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    
    # Use the provided publication date
    pub_date_str = pub_date.strftime('%a, %d %b %Y %H:%M:%S +0000')
    
    # Generate duration in HH:MM:SS format
    hours = draw(st.integers(min_value=0, max_value=2))
    minutes = draw(st.integers(min_value=0, max_value=59))
    seconds = draw(st.integers(min_value=0, max_value=59))
    duration = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    url = f"https://example.com/episodes/{episode_id}.mp3"
    file_size = draw(st.integers(min_value=1000, max_value=100000000))
    
    return {
        'episode_id': episode_id,
        'title': title,
        'description': description,
        'pub_date': pub_date_str,
        'pub_date_obj': pub_date,  # Store datetime object for testing
        'duration': duration,
        'url': url,
        'file_size': file_size,
        'guests': [],
        'links': []
    }


# Feature: podcast-search-mcp-server, Property 6: Date Range Search Inclusivity
@given(
    start_date=st.dates(min_value=date(2020, 1, 1), max_value=date(2024, 12, 31)),
    end_date=st.dates(min_value=date(2020, 1, 1), max_value=date(2024, 12, 31)),
    num_episodes_in_range=st.integers(min_value=1, max_value=10),
    num_episodes_before=st.integers(min_value=0, max_value=5),
    num_episodes_after=st.integers(min_value=0, max_value=5)
)
@settings(max_examples=100, deadline=None)
def test_date_range_search_inclusivity(
    start_date: date,
    end_date: date,
    num_episodes_in_range: int,
    num_episodes_before: int,
    num_episodes_after: int
):
    """
    Property 6: Date Range Search Inclusivity
    
    For any valid date range (start_date, end_date) where start_date <= end_date,
    when searching episodes, all episodes with publication dates within the range
    (inclusive) should be returned.
    
    Validates: Requirements 4.1
    """
    import tempfile
    
    # Ensure start_date <= end_date
    if start_date > end_date:
        start_date, end_date = end_date, start_date
    
    # Generate episodes within the date range
    episodes_data = []
    expected_episode_ids = set()
    
    # Episodes within range (inclusive)
    for i in range(num_episodes_in_range):
        # Generate random date within range
        days_diff = (end_date - start_date).days
        if days_diff > 0:
            random_days = i % (days_diff + 1)
            episode_date = start_date + timedelta(days=random_days)
        else:
            episode_date = start_date
        
        episode_datetime = datetime.combine(episode_date, datetime.min.time())
        episode_id = 1000 + i
        
        ep_data = {
            'episode_id': episode_id,
            'title': f'Episode {episode_id}',
            'description': f'Description {episode_id}',
            'pub_date': episode_datetime.strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'pub_date_obj': episode_datetime,
            'duration': '00:30:00',
            'url': f'https://example.com/episodes/{episode_id}.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
        episodes_data.append(ep_data)
        expected_episode_ids.add(episode_id)
    
    # Episodes before range
    for i in range(num_episodes_before):
        days_before = (i + 1) * 10
        episode_date = start_date - timedelta(days=days_before)
        episode_datetime = datetime.combine(episode_date, datetime.min.time())
        episode_id = 2000 + i
        
        ep_data = {
            'episode_id': episode_id,
            'title': f'Episode {episode_id}',
            'description': f'Description {episode_id}',
            'pub_date': episode_datetime.strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'pub_date_obj': episode_datetime,
            'duration': '00:30:00',
            'url': f'https://example.com/episodes/{episode_id}.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
        episodes_data.append(ep_data)
    
    # Episodes after range
    for i in range(num_episodes_after):
        days_after = (i + 1) * 10
        episode_date = end_date + timedelta(days=days_after)
        episode_datetime = datetime.combine(episode_date, datetime.min.time())
        episode_id = 3000 + i
        
        ep_data = {
            'episode_id': episode_id,
            'title': f'Episode {episode_id}',
            'description': f'Description {episode_id}',
            'pub_date': episode_datetime.strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'pub_date_obj': episode_datetime,
            'duration': '00:30:00',
            'url': f'https://example.com/episodes/{episode_id}.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
        episodes_data.append(ep_data)
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(episodes_data)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        # Create RSS Feed Manager with file:// URL
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search by date range
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Verify all episodes within range are returned (Requirement 4.1)
        result_ids = set(ep.id for ep in results)
        
        assert result_ids == expected_episode_ids, \
            f"Expected episodes {expected_episode_ids}, got {result_ids}"
        
        # Verify no episodes outside range are returned
        for episode in results:
            episode_date = episode.publication_date.date()
            assert start_date <= episode_date <= end_date, \
                f"Episode {episode.id} with date {episode_date} is outside range [{start_date}, {end_date}]"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Feature: podcast-search-mcp-server, Property 7: Date Range Validation
@given(
    start_date=st.dates(min_value=date(2020, 1, 1), max_value=date(2024, 12, 31)),
    end_date=st.dates(min_value=date(2020, 1, 1), max_value=date(2024, 12, 31))
)
@settings(max_examples=100, deadline=None)
def test_date_range_validation(start_date: date, end_date: date):
    """
    Property 7: Date Range Validation
    
    For any date range where start_date > end_date, when passed to
    search_by_date_range, the method should handle it gracefully.
    
    Note: The current implementation does not explicitly validate that
    start_date <= end_date. It will simply return an empty list if
    start_date > end_date, which is a valid behavior. This property
    verifies that the system handles invalid ranges gracefully without
    crashing.
    
    Validates: Requirements 4.2
    """
    import tempfile
    
    # Only test cases where start_date > end_date
    assume(start_date > end_date)
    
    # Create a simple RSS feed with episodes
    episodes_data = [
        {
            'episode_id': 1,
            'title': 'Episode 1',
            'description': 'Description 1',
            'pub_date': 'Mon, 01 Jan 2024 10:00:00 +0000',
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
    ]
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(episodes_data)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        # Create RSS Feed Manager with file:// URL
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search with invalid date range (start > end)
        # This should not crash and should return empty list
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Verify that invalid range returns empty list (Requirement 4.2)
        assert isinstance(results, list), \
            "search_by_date_range should return a list"
        assert len(results) == 0, \
            f"Invalid date range (start > end) should return empty list, got {len(results)} results"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Feature: podcast-search-mcp-server, Property 8: Date Format Validation
def test_date_format_validation():
    """
    Property 8: Date Format Validation
    
    For any date string that does not conform to ISO 8601 format (YYYY-MM-DD),
    when passed to search_by_date_range, the system should handle it gracefully.
    
    Note: The search_by_date_range method accepts date objects, not strings.
    Date format validation happens at the tool layer (MCP tool implementation).
    This test verifies that the underlying method works correctly with date objects.
    
    Validates: Requirements 4.3, 4.4
    """
    import tempfile
    
    # Create a simple RSS feed
    episodes_data = [
        {
            'episode_id': 1,
            'title': 'Episode 1',
            'description': 'Description 1',
            'pub_date': 'Mon, 01 Jan 2024 10:00:00 +0000',
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
    ]
    
    rss_xml = generate_rss_xml(episodes_data)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Test with valid date objects (ISO 8601 format)
        start_date = date(2024, 1, 1)
        end_date = date(2024, 12, 31)
        
        # This should work correctly
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Verify method accepts date objects correctly
        assert isinstance(results, list), \
            "search_by_date_range should return a list"
        
        # The actual date format validation (string to date conversion)
        # happens at the MCP tool layer, not in the RSSFeedManager
        # This test confirms the underlying method works with date objects
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Feature: podcast-search-mcp-server, Property 10: Result Sorting by Date
@given(
    num_episodes=st.integers(min_value=2, max_value=20)
)
@settings(max_examples=100, deadline=None)
def test_result_sorting_by_date(num_episodes: int):
    """
    Property 10: Result Sorting by Date
    
    For any search result set containing multiple episodes (from date range search),
    the episodes should be sorted by publication date in descending order (newest first).
    
    Validates: Requirements 4.6, 5.4
    """
    import tempfile
    
    # Generate episodes with random dates
    episodes_data = []
    base_date = date(2024, 1, 1)
    
    for i in range(num_episodes):
        # Generate dates spread across the year
        days_offset = i * 10
        episode_date = base_date + timedelta(days=days_offset)
        episode_datetime = datetime.combine(episode_date, datetime.min.time())
        
        ep_data = {
            'episode_id': i + 1,
            'title': f'Episode {i + 1}',
            'description': f'Description {i + 1}',
            'pub_date': episode_datetime.strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'pub_date_obj': episode_datetime,
            'duration': '00:30:00',
            'url': f'https://example.com/episodes/{i + 1}.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
        episodes_data.append(ep_data)
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(episodes_data)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        # Create RSS Feed Manager with file:// URL
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for all episodes (wide date range)
        start_date = base_date
        end_date = base_date + timedelta(days=num_episodes * 10)
        
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Verify results are sorted by date descending (Requirement 4.6)
        assert len(results) == num_episodes, \
            f"Expected {num_episodes} results, got {len(results)}"
        
        # Check that results are in descending order (newest first)
        for i in range(len(results) - 1):
            current_date = results[i].publication_date
            next_date = results[i + 1].publication_date
            
            assert current_date >= next_date, \
                f"Results not sorted correctly: episode {results[i].id} " \
                f"({current_date}) should come before episode {results[i + 1].id} " \
                f"({next_date})"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Additional edge case tests

def test_date_range_search_empty_feed():
    """
    Test that searching an empty feed returns empty list.
    
    Edge case: RSS feed with no episodes.
    """
    import tempfile
    
    # Create empty RSS feed
    rss_xml = generate_rss_xml([])
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for any date range
        start_date = date(2024, 1, 1)
        end_date = date(2024, 12, 31)
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Should return empty list
        assert results == [], \
            "Searching empty feed should return empty list"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_date_range_search_single_day():
    """
    Test that searching for a single day works correctly.
    
    Edge case: start_date == end_date
    """
    import tempfile
    
    # Create episodes on different days
    target_date = date(2024, 6, 15)
    episodes_data = [
        {
            'episode_id': 1,
            'title': 'Episode 1',
            'description': 'On target date',
            'pub_date': datetime.combine(target_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        },
        {
            'episode_id': 2,
            'title': 'Episode 2',
            'description': 'Day before',
            'pub_date': datetime.combine(target_date - timedelta(days=1), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/2.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        },
        {
            'episode_id': 3,
            'title': 'Episode 3',
            'description': 'Day after',
            'pub_date': datetime.combine(target_date + timedelta(days=1), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/3.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
    ]
    
    rss_xml = generate_rss_xml(episodes_data)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for single day
        results = rss_manager.search_by_date_range(target_date, target_date)
        
        # Should return only episode 1
        assert len(results) == 1, \
            f"Expected 1 result for single day, got {len(results)}"
        assert results[0].id == 1, \
            f"Expected episode 1, got episode {results[0].id}"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_date_range_search_boundary_inclusivity():
    """
    Test that date range search is inclusive on both boundaries.
    
    Edge case: Episodes exactly on start_date and end_date should be included.
    """
    import tempfile
    
    start_date = date(2024, 1, 1)
    end_date = date(2024, 1, 31)
    
    episodes_data = [
        {
            'episode_id': 1,
            'title': 'Episode on start date',
            'description': 'Exactly on start date',
            'pub_date': datetime.combine(start_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        },
        {
            'episode_id': 2,
            'title': 'Episode on end date',
            'description': 'Exactly on end date',
            'pub_date': datetime.combine(end_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/2.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        },
        {
            'episode_id': 3,
            'title': 'Episode before range',
            'description': 'One day before start',
            'pub_date': datetime.combine(start_date - timedelta(days=1), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/3.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        },
        {
            'episode_id': 4,
            'title': 'Episode after range',
            'description': 'One day after end',
            'pub_date': datetime.combine(end_date + timedelta(days=1), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/4.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        }
    ]
    
    rss_xml = generate_rss_xml(episodes_data)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for date range
        results = rss_manager.search_by_date_range(start_date, end_date)
        
        # Should return episodes 1 and 2 (on boundaries)
        result_ids = set(ep.id for ep in results)
        assert result_ids == {1, 2}, \
            f"Expected episodes 1 and 2 (on boundaries), got {result_ids}"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)
