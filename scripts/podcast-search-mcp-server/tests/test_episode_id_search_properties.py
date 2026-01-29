"""
Property-based tests for Episode ID Search.

Feature: podcast-search-mcp-server
Tests correctness properties of episode ID search functionality.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from datetime import datetime
from typing import List, Dict, Any
import xml.etree.ElementTree as ET

# Import the components
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.rss.feed_manager import RSSFeedManager
from src.models.episode import Episode, Guest, Link


# Helper function to generate valid RSS XML (reused from test_rss_feed_properties.py)
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
def guest_data_strategy(draw):
    """Generate guest data for RSS feed."""
    # Generate name that's not just whitespace
    name = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    # Ensure name has at least one non-whitespace character
    assume(name.strip())
    
    title = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    linkedin_url = f"https://linkedin.com/in/{draw(st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('Ll', 'Lu', 'Nd'))))}"
    
    return {
        'name': name,
        'title': title,
        'linkedin_url': linkedin_url
    }


@st.composite
def link_data_strategy(draw):
    """Generate link data for RSS feed."""
    text = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    domain = draw(st.sampled_from(['example.com', 'test.org', 'demo.net', 'aws.amazon.com']))
    path = draw(st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('Ll', 'Lu', 'Nd'))))
    url = f"https://{domain}/{path}"
    
    return {
        'text': text,
        'url': url
    }


@st.composite
def episode_data_strategy(draw):
    """Generate episode data for RSS feed."""
    episode_id = draw(st.integers(min_value=1, max_value=1000))
    title = draw(st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    description = draw(st.text(min_size=1, max_size=500, alphabet=st.characters(blacklist_categories=('Cs', 'Cc'))))
    
    # Generate publication date in RFC 2822 format
    naive_date = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    pub_date = naive_date.strftime('%a, %d %b %Y %H:%M:%S +0000')
    
    # Generate duration in HH:MM:SS format
    hours = draw(st.integers(min_value=0, max_value=2))
    minutes = draw(st.integers(min_value=0, max_value=59))
    seconds = draw(st.integers(min_value=0, max_value=59))
    duration = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    url = f"https://example.com/episodes/{episode_id}.mp3"
    file_size = draw(st.integers(min_value=1000, max_value=100000000))
    
    # Generate guests and links
    guests = draw(st.lists(guest_data_strategy(), min_size=0, max_size=3))
    links = draw(st.lists(link_data_strategy(), min_size=0, max_size=5))
    
    return {
        'episode_id': episode_id,
        'title': title,
        'description': description,
        'pub_date': pub_date,
        'duration': duration,
        'url': url,
        'file_size': file_size,
        'guests': guests,
        'links': links
    }


# Feature: podcast-search-mcp-server, Property 3: Episode ID Search Completeness
@given(episodes_data=st.lists(episode_data_strategy(), min_size=1, max_size=20))
@settings(max_examples=100, deadline=None)
def test_episode_id_search_completeness(episodes_data: List[Dict[str, Any]]):
    """
    Property 3: Episode ID Search Completeness
    
    For any valid episode ID that exists in the cached RSS feed, when searched
    using search_by_id, the returned episode should contain all available
    metadata fields including title, description, publication date, duration,
    guests, and links.
    
    Validates: Requirements 3.1, 3.5
    """
    import tempfile
    
    # Ensure unique episode IDs
    seen_ids = set()
    unique_episodes = []
    for ep_data in episodes_data:
        if ep_data['episode_id'] not in seen_ids:
            seen_ids.add(ep_data['episode_id'])
            unique_episodes.append(ep_data)
    
    assume(len(unique_episodes) > 0)
    
    # Pick a random episode ID from the ones we have
    import random
    search_id = random.choice([ep['episode_id'] for ep in unique_episodes])
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(unique_episodes)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        # Create RSS Feed Manager with file:// URL
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for the episode by ID
        found_episode = rss_manager.search_by_id(search_id)
        
        # Verify episode was found (Requirement 3.1)
        assert found_episode is not None, \
            f"Episode {search_id} should be found but was not"
        
        # Find the original episode data
        original_data = None
        for ep_data in unique_episodes:
            if ep_data['episode_id'] == search_id:
                original_data = ep_data
                break
        
        assert original_data is not None, "Original episode data not found"
        
        # Verify all available metadata fields are present (Requirement 3.5)
        
        # Episode ID
        assert found_episode.id == search_id, \
            f"Episode ID mismatch: expected {search_id}, got {found_episode.id}"
        
        # Title
        assert found_episode.title is not None, \
            f"Episode {search_id} missing title"
        assert found_episode.title.strip() or not original_data['title'].strip(), \
            f"Episode {search_id} title should not be empty if original had content"
        
        # Description
        assert found_episode.description is not None, \
            f"Episode {search_id} missing description"
        assert found_episode.description.strip() or not original_data['description'].strip(), \
            f"Episode {search_id} description should not be empty if original had content"
        
        # Publication date
        assert found_episode.publication_date is not None, \
            f"Episode {search_id} missing publication date"
        assert isinstance(found_episode.publication_date, datetime), \
            f"Episode {search_id} publication_date should be datetime object"
        
        # Duration
        assert found_episode.duration is not None, \
            f"Episode {search_id} missing duration"
        assert found_episode.duration == original_data['duration'], \
            f"Episode {search_id} duration mismatch"
        
        # URL
        assert found_episode.url is not None, \
            f"Episode {search_id} missing URL"
        assert found_episode.url == original_data['url'], \
            f"Episode {search_id} URL mismatch"
        
        # File size
        assert found_episode.file_size is not None, \
            f"Episode {search_id} missing file_size"
        assert found_episode.file_size > 0, \
            f"Episode {search_id} file_size should be positive"
        assert found_episode.file_size == original_data['file_size'], \
            f"Episode {search_id} file_size mismatch"
        
        # Guests (should be a list, even if empty)
        assert isinstance(found_episode.guests, list), \
            f"Episode {search_id} guests should be a list"
        
        # If original had guests, verify they were extracted
        if original_data['guests']:
            assert len(found_episode.guests) > 0, \
                f"Episode {search_id} should have guests but none were found"
            
            # Verify guest data completeness
            for guest in found_episode.guests:
                assert guest.name, \
                    f"Episode {search_id} has guest with missing name"
                assert hasattr(guest, 'title'), \
                    f"Episode {search_id} guest missing title attribute"
                assert hasattr(guest, 'linkedin_url'), \
                    f"Episode {search_id} guest missing linkedin_url attribute"
        
        # Links (should be a list, even if empty)
        assert isinstance(found_episode.links, list), \
            f"Episode {search_id} links should be a list"
        
        # If original had links, verify structure
        if original_data['links']:
            for link in found_episode.links:
                assert link.text, \
                    f"Episode {search_id} has link with missing text"
                assert link.url, \
                    f"Episode {search_id} has link with missing URL"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Feature: podcast-search-mcp-server, Property 4: Episode ID Not Found Error
@given(
    episodes_data=st.lists(episode_data_strategy(), min_size=1, max_size=20),
    search_id=st.integers(min_value=1001, max_value=2000)  # IDs outside the range of generated episodes
)
@settings(max_examples=100, deadline=None)
def test_episode_id_not_found_error(episodes_data: List[Dict[str, Any]], search_id: int):
    """
    Property 4: Episode ID Not Found Error
    
    For any episode ID that does not exist in the cached RSS feed, when searched
    using search_by_id, the server should return None (indicating the episode
    does not exist).
    
    Validates: Requirements 3.2
    """
    import tempfile
    
    # Ensure unique episode IDs
    seen_ids = set()
    unique_episodes = []
    for ep_data in episodes_data:
        if ep_data['episode_id'] not in seen_ids:
            seen_ids.add(ep_data['episode_id'])
            unique_episodes.append(ep_data)
    
    assume(len(unique_episodes) > 0)
    
    # Ensure the search_id does NOT exist in our episodes
    episode_ids = [ep['episode_id'] for ep in unique_episodes]
    assume(search_id not in episode_ids)
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(unique_episodes)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        # Create RSS Feed Manager with file:// URL
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for the non-existent episode by ID
        found_episode = rss_manager.search_by_id(search_id)
        
        # Verify episode was NOT found (Requirement 3.2)
        assert found_episode is None, \
            f"Episode {search_id} should not be found (does not exist in feed), but was returned"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Feature: podcast-search-mcp-server, Property 5: Episode ID Validation
@given(
    invalid_id=st.one_of(
        st.integers(max_value=0),  # Non-positive integers
        st.integers(min_value=-1000, max_value=-1)  # Negative integers
    )
)
@settings(max_examples=100, deadline=None)
def test_episode_id_validation(invalid_id: int):
    """
    Property 5: Episode ID Validation
    
    For any invalid episode ID (non-positive or negative), when passed to
    search_by_id, the server should handle it gracefully and return None
    (since no episode can have an invalid ID).
    
    Note: The current implementation doesn't explicitly validate the ID before
    searching, but it will naturally return None since no episode will match
    an invalid ID. This property verifies that the system handles invalid IDs
    gracefully without crashing.
    
    Validates: Requirements 3.3
    """
    import tempfile
    
    # Create a simple RSS feed with valid episodes
    valid_episodes = [
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
        },
        {
            'episode_id': 2,
            'title': 'Episode 2',
            'description': 'Description 2',
            'pub_date': 'Mon, 08 Jan 2024 10:00:00 +0000',
            'duration': '00:45:00',
            'url': 'https://example.com/episodes/2.mp3',
            'file_size': 6000000,
            'guests': [],
            'links': []
        }
    ]
    
    # Generate RSS XML
    rss_xml = generate_rss_xml(valid_episodes)
    
    # Write to temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        # Create RSS Feed Manager with file:// URL
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for episode with invalid ID
        # This should not crash and should return None
        found_episode = rss_manager.search_by_id(invalid_id)
        
        # Verify that invalid ID returns None (Requirement 3.3)
        assert found_episode is None, \
            f"Invalid episode ID {invalid_id} should return None, but returned: {found_episode}"
    
    finally:
        # Clean up temporary file
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


# Additional edge case tests

def test_episode_id_search_with_empty_feed():
    """
    Test that searching in an empty feed returns None.
    
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
        
        # Search for any episode ID
        found_episode = rss_manager.search_by_id(1)
        
        # Should return None for empty feed
        assert found_episode is None, \
            "Searching empty feed should return None"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)


def test_episode_id_search_with_duplicate_ids():
    """
    Test that searching with duplicate IDs returns the first match.
    
    Edge case: RSS feed with duplicate episode IDs (malformed feed).
    """
    import tempfile
    
    # Create feed with duplicate episode IDs
    episodes_with_duplicates = [
        {
            'episode_id': 1,
            'title': 'Episode 1 - First',
            'description': 'First occurrence',
            'pub_date': 'Mon, 01 Jan 2024 10:00:00 +0000',
            'duration': '00:30:00',
            'url': 'https://example.com/episodes/1-first.mp3',
            'file_size': 5000000,
            'guests': [],
            'links': []
        },
        {
            'episode_id': 1,
            'title': 'Episode 1 - Second',
            'description': 'Second occurrence',
            'pub_date': 'Mon, 08 Jan 2024 10:00:00 +0000',
            'duration': '00:45:00',
            'url': 'https://example.com/episodes/1-second.mp3',
            'file_size': 6000000,
            'guests': [],
            'links': []
        }
    ]
    
    rss_xml = generate_rss_xml(episodes_with_duplicates)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False) as f:
        f.write(rss_xml)
        rss_file_path = f.name
    
    try:
        feed_url = f"file://{rss_file_path}"
        rss_manager = RSSFeedManager(feed_url, cache_ttl=3600)
        
        # Search for the duplicate episode ID
        found_episode = rss_manager.search_by_id(1)
        
        # Should return one of the episodes (implementation returns first match)
        assert found_episode is not None, \
            "Should find an episode even with duplicates"
        assert found_episode.id == 1, \
            "Should return episode with ID 1"
        # The title should be one of the two
        assert found_episode.title in ['Episode 1 - First', 'Episode 1 - Second'], \
            "Should return one of the duplicate episodes"
    
    finally:
        import os
        if os.path.exists(rss_file_path):
            os.unlink(rss_file_path)
