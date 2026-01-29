"""
Property-based tests for Guest Search.

Feature: podcast-search-mcp-server
Tests correctness properties of guest search functionality.
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


# Hypothesis strategies for generating guest names
@st.composite
def guest_name_strategy(draw):
    """Generate realistic guest names."""
    first_names = ['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank']
    last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']
    
    first_name = draw(st.sampled_from(first_names))
    last_name = draw(st.sampled_from(last_names))
    
    return f"{first_name} {last_name}"


# Feature: podcast-search-mcp-server, Property 11: Guest Search Case Insensitivity
@given(
    guest_name=guest_name_strategy(),
    case_variant=st.sampled_from(['lower', 'upper', 'title', 'mixed'])
)
@settings(max_examples=100, deadline=None)
def test_guest_search_case_insensitivity(guest_name: str, case_variant: str):
    """
    Property 11: Guest Search Case Insensitivity
    
    For any guest name query, when searching episodes, the search should match
    guest names regardless of case (uppercase, lowercase, or mixed case).
    
    Validates: Requirements 5.1, 5.2
    """
    import tempfile
    
    # Create episodes with the guest
    base_date = date(2024, 1, 1)
    episodes_data = []
    
    # Episode with the guest (original case)
    ep_data = {
        'episode_id': 1,
        'title': 'Episode with Guest',
        'description': f'Episode featuring {guest_name}',
        'pub_date': datetime.combine(base_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
        'duration': '00:30:00',
        'url': 'https://example.com/episodes/1.mp3',
        'file_size': 5000000,
        'guests': [
            {
                'name': guest_name,
                'title': 'Software Engineer',
                'linkedin_url': 'https://linkedin.com/in/guest'
            }
        ],
        'links': []
    }
    episodes_data.append(ep_data)
    
    # Episode without the guest
    ep_data_2 = {
        'episode_id': 2,
        'title': 'Episode without Guest',
        'description': 'Episode with different guest',
        'pub_date': datetime.combine(base_date + timedelta(days=1), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
        'duration': '00:30:00',
        'url': 'https://example.com/episodes/2.mp3',
        'file_size': 5000000,
        'guests': [
            {
                'name': 'Different Person',
                'title': 'Product Manager',
                'linkedin_url': 'https://linkedin.com/in/different'
            }
        ],
        'links': []
    }
    episodes_data.append(ep_data_2)
    
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
        
        # Transform guest name based on case variant
        if case_variant == 'lower':
            search_name = guest_name.lower()
        elif case_variant == 'upper':
            search_name = guest_name.upper()
        elif case_variant == 'title':
            search_name = guest_name.title()
        else:  # mixed
            # Create mixed case by alternating
            search_name = ''.join(
                c.upper() if i % 2 == 0 else c.lower()
                for i, c in enumerate(guest_name)
            )
        
        # Search by guest name with different case
        results = rss_manager.search_by_guest(search_name)
        
        # Verify case-insensitive matching (Requirements 5.1, 5.2)
        assert len(results) == 1, \
            f"Expected 1 result for guest '{search_name}' (original: '{guest_name}'), got {len(results)}"
        
        assert results[0].id == 1, \
            f"Expected episode 1, got episode {results[0].id}"
        
        # Verify the guest is in the results
        guest_names = [g.name for g in results[0].guests]
        assert guest_name in guest_names, \
            f"Expected guest '{guest_name}' in results, got {guest_names}"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Feature: podcast-search-mcp-server, Property 12: Guest Search Partial Matching
@given(
    full_name=guest_name_strategy(),
    match_type=st.sampled_from(['first_name', 'last_name', 'substring'])
)
@settings(max_examples=100, deadline=None)
def test_guest_search_partial_matching(full_name: str, match_type: str):
    """
    Property 12: Guest Search Partial Matching
    
    For any partial guest name (substring of a full guest name), when searching
    episodes, all episodes featuring guests whose names contain that substring
    should be returned.
    
    Validates: Requirements 5.2
    """
    import tempfile
    
    # Extract partial name based on match type
    name_parts = full_name.split()
    
    if match_type == 'first_name' and len(name_parts) > 0:
        partial_name = name_parts[0]
    elif match_type == 'last_name' and len(name_parts) > 1:
        partial_name = name_parts[-1]
    else:  # substring
        # Take a substring from the middle of the name
        if len(full_name) > 3:
            start_idx = len(full_name) // 4
            end_idx = 3 * len(full_name) // 4
            partial_name = full_name[start_idx:end_idx]
        else:
            partial_name = full_name[:2] if len(full_name) >= 2 else full_name
    
    # Skip if partial name is empty or too short
    assume(len(partial_name) >= 2)
    
    # Create episodes
    base_date = date(2024, 1, 1)
    episodes_data = []
    
    # Episode with the guest (should match)
    ep_data_1 = {
        'episode_id': 1,
        'title': 'Episode with Matching Guest',
        'description': f'Episode featuring {full_name}',
        'pub_date': datetime.combine(base_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
        'duration': '00:30:00',
        'url': 'https://example.com/episodes/1.mp3',
        'file_size': 5000000,
        'guests': [
            {
                'name': full_name,
                'title': 'Software Engineer',
                'linkedin_url': 'https://linkedin.com/in/guest1'
            }
        ],
        'links': []
    }
    episodes_data.append(ep_data_1)
    
    # Episode with a different guest (should not match)
    ep_data_2 = {
        'episode_id': 2,
        'title': 'Episode with Different Guest',
        'description': 'Episode with unrelated guest',
        'pub_date': datetime.combine(base_date + timedelta(days=1), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
        'duration': '00:30:00',
        'url': 'https://example.com/episodes/2.mp3',
        'file_size': 5000000,
        'guests': [
            {
                'name': 'Completely Different Person',
                'title': 'Product Manager',
                'linkedin_url': 'https://linkedin.com/in/guest2'
            }
        ],
        'links': []
    }
    episodes_data.append(ep_data_2)
    
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
        
        # Search by partial guest name
        results = rss_manager.search_by_guest(partial_name)
        
        # Verify partial matching works (Requirement 5.2)
        # Should find episode 1 (contains partial_name in full_name)
        assert len(results) >= 1, \
            f"Expected at least 1 result for partial name '{partial_name}' " \
            f"(full name: '{full_name}'), got {len(results)}"
        
        # Verify episode 1 is in results
        result_ids = [ep.id for ep in results]
        assert 1 in result_ids, \
            f"Expected episode 1 in results for partial name '{partial_name}', got {result_ids}"
        
        # Verify all returned episodes actually contain the partial name
        for episode in results:
            guest_names = [g.name.lower() for g in episode.guests]
            partial_lower = partial_name.lower()
            
            # At least one guest should contain the partial name
            matches = any(partial_lower in name for name in guest_names)
            assert matches, \
                f"Episode {episode.id} returned but no guest contains '{partial_name}'. " \
                f"Guests: {[g.name for g in episode.guests]}"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Additional edge case tests

def test_guest_search_no_matches():
    """
    Test that searching for a non-existent guest returns empty list.
    
    Edge case: Guest name that doesn't match any episodes.
    """
    import tempfile
    
    # Create episodes with guests
    base_date = date(2024, 1, 1)
    episodes_data = [
        {
            'episode_id': 1,
            'title': 'Episode 1',
            'description': 'Episode with guest',
            'pub_date': datetime.combine(base_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1.mp3',
            'file_size': 5000000,
            'guests': [
                {
                    'name': 'John Smith',
                    'title': 'Engineer',
                    'linkedin_url': 'https://linkedin.com/in/john'
                }
            ],
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
        
        # Search for non-existent guest
        results = rss_manager.search_by_guest('NonExistent Person')
        
        # Should return empty list
        assert results == [], \
            f"Expected empty list for non-existent guest, got {len(results)} results"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_guest_search_empty_feed():
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
        
        # Search for any guest
        results = rss_manager.search_by_guest('John Smith')
        
        # Should return empty list
        assert results == [], \
            "Searching empty feed should return empty list"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_guest_search_episodes_without_guests():
    """
    Test that searching episodes without guests returns empty list.
    
    Edge case: Episodes exist but none have guests.
    """
    import tempfile
    
    # Create episodes without guests
    base_date = date(2024, 1, 1)
    episodes_data = [
        {
            'episode_id': 1,
            'title': 'Episode 1',
            'description': 'Episode without guests',
            'pub_date': datetime.combine(base_date, datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1.mp3',
            'file_size': 5000000,
            'guests': [],  # No guests
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
        
        # Search for any guest
        results = rss_manager.search_by_guest('John Smith')
        
        # Should return empty list
        assert results == [], \
            "Searching episodes without guests should return empty list"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_guest_search_multiple_episodes_same_guest():
    """
    Test that searching returns all episodes featuring the same guest.
    
    Edge case: Multiple episodes with the same guest.
    """
    import tempfile
    
    # Create multiple episodes with the same guest
    base_date = date(2024, 1, 1)
    guest_name = 'John Smith'
    
    episodes_data = []
    for i in range(3):
        ep_data = {
            'episode_id': i + 1,
            'title': f'Episode {i + 1}',
            'description': f'Episode {i + 1} with {guest_name}',
            'pub_date': datetime.combine(base_date + timedelta(days=i), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': f'https://example.com/episodes/{i + 1}.mp3',
            'file_size': 5000000,
            'guests': [
                {
                    'name': guest_name,
                    'title': 'Engineer',
                    'linkedin_url': 'https://linkedin.com/in/john'
                }
            ],
            'links': []
        }
        episodes_data.append(ep_data)
    
    rss_xml = generate_rss_xml(episodes_data)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for the guest
        results = rss_manager.search_by_guest(guest_name)
        
        # Should return all 3 episodes
        assert len(results) == 3, \
            f"Expected 3 episodes for guest '{guest_name}', got {len(results)}"
        
        # Verify all episodes are returned
        result_ids = set(ep.id for ep in results)
        assert result_ids == {1, 2, 3}, \
            f"Expected episodes 1, 2, 3, got {result_ids}"
        
        # Verify results are sorted by date descending (Requirement 5.4)
        for i in range(len(results) - 1):
            assert results[i].publication_date >= results[i + 1].publication_date, \
                f"Results not sorted by date descending"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_guest_search_special_characters():
    """
    Test that guest search handles special characters correctly.
    
    Edge case: Guest names with special characters (hyphens, apostrophes, etc.)
    """
    import tempfile
    
    # Create episodes with guests having special characters
    base_date = date(2024, 1, 1)
    special_names = [
        "Jean-Pierre Dubois",
        "O'Connor Smith",
        "María García"
    ]
    
    episodes_data = []
    for i, name in enumerate(special_names):
        ep_data = {
            'episode_id': i + 1,
            'title': f'Episode {i + 1}',
            'description': f'Episode with {name}',
            'pub_date': datetime.combine(base_date + timedelta(days=i), datetime.min.time()).strftime('%a, %d %b %Y %H:%M:%S +0000'),
            'duration': '00:30:00',
            'url': f'https://example.com/episodes/{i + 1}.mp3',
            'file_size': 5000000,
            'guests': [
                {
                    'name': name,
                    'title': 'Guest',
                    'linkedin_url': f'https://linkedin.com/in/guest{i + 1}'
                }
            ],
            'links': []
        }
        episodes_data.append(ep_data)
    
    rss_xml = generate_rss_xml(episodes_data)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Test searching for each special name
        for i, name in enumerate(special_names):
            results = rss_manager.search_by_guest(name)
            
            assert len(results) == 1, \
                f"Expected 1 result for guest '{name}', got {len(results)}"
            assert results[0].id == i + 1, \
                f"Expected episode {i + 1} for guest '{name}', got {results[0].id}"
        
        # Test partial matching with special characters
        results = rss_manager.search_by_guest("Pierre")
        assert len(results) == 1 and results[0].id == 1, \
            "Partial match 'Pierre' should find 'Jean-Pierre Dubois'"
        
        results = rss_manager.search_by_guest("O'Connor")
        assert len(results) == 1 and results[0].id == 2, \
            "Partial match 'O'Connor' should find 'O'Connor Smith'"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)
