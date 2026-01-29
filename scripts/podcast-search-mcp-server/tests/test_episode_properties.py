"""
Property-based tests for Episode data model.

Feature: podcast-search-mcp-server
Tests correctness properties of the Episode, Guest, and Link data models.
"""

import pytest
from hypothesis import given, strategies as st
from datetime import datetime, timezone
from typing import List

# Import the data models
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.models.episode import Episode, Guest, Link


# Hypothesis strategies for generating test data
@st.composite
def link_strategy(draw):
    """Generate a valid Link object."""
    text = draw(st.text(min_size=1, max_size=100))
    url = draw(st.text(min_size=1, max_size=200))
    return Link(text=text, url=url)


@st.composite
def guest_strategy(draw):
    """Generate a valid Guest object."""
    name = draw(st.text(min_size=1, max_size=100))
    title = draw(st.one_of(st.none(), st.text(min_size=1, max_size=100)))
    linkedin_url = draw(st.one_of(st.none(), st.text(min_size=1, max_size=200)))
    return Guest(name=name, title=title, linkedin_url=linkedin_url)


@st.composite
def episode_strategy(draw):
    """Generate a valid Episode object."""
    episode_id = draw(st.integers(min_value=1, max_value=10000))
    title = draw(st.text(min_size=1, max_size=200))
    description = draw(st.text(min_size=1, max_size=1000))
    
    # Generate a valid datetime (naive first, then add timezone)
    naive_date = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    # Add UTC timezone to make it aware
    publication_date = naive_date.replace(tzinfo=timezone.utc)
    
    # Generate duration in HH:MM:SS format
    hours = draw(st.integers(min_value=0, max_value=2))
    minutes = draw(st.integers(min_value=0, max_value=59))
    seconds = draw(st.integers(min_value=0, max_value=59))
    duration = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    url = draw(st.text(min_size=1, max_size=300))
    file_size = draw(st.integers(min_value=1, max_value=1000000000))
    
    # Generate lists of guests and links
    guests = draw(st.lists(guest_strategy(), min_size=0, max_size=5))
    links = draw(st.lists(link_strategy(), min_size=0, max_size=10))
    
    return Episode(
        id=episode_id,
        title=title,
        description=description,
        publication_date=publication_date,
        duration=duration,
        url=url,
        file_size=file_size,
        guests=guests,
        links=links
    )


# Feature: podcast-search-mcp-server, Property 22: Episode Response Completeness
@given(episode=episode_strategy())
def test_episode_response_completeness(episode: Episode):
    """
    Property 22: Episode Response Completeness
    
    For any search result containing episodes, each episode in the results array
    should include all available metadata: episode_id, title, description,
    publication_date, duration, url, guests (with names, titles, LinkedIn URLs),
    and links (with text and URLs).
    
    Validates: Requirements 9.2, 9.3, 9.4
    """
    # Convert episode to dictionary (simulating API response)
    response = episode.to_dict()
    
    # Verify all required episode fields are present
    assert "episode_id" in response, "Response must include episode_id"
    assert "title" in response, "Response must include title"
    assert "description" in response, "Response must include description"
    assert "publication_date" in response, "Response must include publication_date"
    assert "duration" in response, "Response must include duration"
    assert "url" in response, "Response must include url"
    assert "file_size" in response, "Response must include file_size"
    assert "guests" in response, "Response must include guests array"
    assert "links" in response, "Response must include links array"
    
    # Verify episode field values match original data
    assert response["episode_id"] == episode.id
    assert response["title"] == episode.title
    assert response["description"] == episode.description
    assert response["duration"] == episode.duration
    assert response["url"] == episode.url
    assert response["file_size"] == episode.file_size
    
    # Verify publication_date is in ISO format
    assert isinstance(response["publication_date"], str)
    # Should be parseable back to datetime
    parsed_date = datetime.fromisoformat(response["publication_date"])
    assert parsed_date is not None
    
    # Verify guests array structure (Requirement 9.3)
    assert isinstance(response["guests"], list)
    assert len(response["guests"]) == len(episode.guests)
    
    for i, guest_dict in enumerate(response["guests"]):
        original_guest = episode.guests[i]
        
        # Each guest must have required fields
        assert "name" in guest_dict, "Guest must include name"
        assert "title" in guest_dict, "Guest must include title field (can be null)"
        assert "linkedin_url" in guest_dict, "Guest must include linkedin_url field (can be null)"
        
        # Verify guest values match original data
        assert guest_dict["name"] == original_guest.name
        assert guest_dict["title"] == original_guest.title
        assert guest_dict["linkedin_url"] == original_guest.linkedin_url
    
    # Verify links array structure (Requirement 9.4)
    assert isinstance(response["links"], list)
    assert len(response["links"]) == len(episode.links)
    
    for i, link_dict in enumerate(response["links"]):
        original_link = episode.links[i]
        
        # Each link must have required fields
        assert "text" in link_dict, "Link must include text"
        assert "url" in link_dict, "Link must include url"
        
        # Verify link values match original data
        assert link_dict["text"] == original_link.text
        assert link_dict["url"] == original_link.url


# Additional test to verify empty guests and links are handled correctly
@given(
    episode_id=st.integers(min_value=1, max_value=10000),
    title=st.text(min_size=1, max_size=200),
    description=st.text(min_size=1, max_size=1000),
    naive_date=st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ),
    url=st.text(min_size=1, max_size=300),
    file_size=st.integers(min_value=1, max_value=1000000000)
)
def test_episode_response_with_empty_guests_and_links(
    episode_id: int,
    title: str,
    description: str,
    naive_date: datetime,
    url: str,
    file_size: int
):
    """
    Verify that episodes with no guests or links still have complete responses.
    
    This tests the edge case where guests and links arrays are empty.
    """
    # Add timezone to make it aware
    publication_date = naive_date.replace(tzinfo=timezone.utc)
    
    # Create episode with no guests or links
    episode = Episode(
        id=episode_id,
        title=title,
        description=description,
        publication_date=publication_date,
        duration="00:45:30",
        url=url,
        file_size=file_size,
        guests=[],
        links=[]
    )
    
    response = episode.to_dict()
    
    # Verify all required fields are still present
    assert "episode_id" in response
    assert "title" in response
    assert "description" in response
    assert "publication_date" in response
    assert "duration" in response
    assert "url" in response
    assert "file_size" in response
    assert "guests" in response
    assert "links" in response
    
    # Verify empty arrays are returned (not null)
    assert response["guests"] == []
    assert response["links"] == []
