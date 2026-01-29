"""RSS feed parsing logic."""

import logging
import re
from typing import Optional, List, Any
from datetime import datetime

import feedparser
from dateutil import parser as date_parser

from ..models.episode import Episode, Guest, Link
from ..utils.logging import get_logger, log_with_context


logger = get_logger("RSSParser")


def parse_feed(feed_url: str) -> List[Episode]:
    """
    Parse RSS feed from URL into Episode objects.
    
    Args:
        feed_url: URL of the RSS feed
        
    Returns:
        List of Episode objects
        
    Raises:
        RuntimeError: If parsing fails
    """
    try:
        logger.info(f"Parsing RSS feed from {feed_url}")
        
        # Fetch and parse RSS feed
        feed = feedparser.parse(feed_url)
        
        # Check for parsing errors
        if feed.bozo:
            error_msg = getattr(feed, 'bozo_exception', 'Unknown parsing error')
            # Log the problematic XML section if available
            log_with_context(
                logger,
                logging.WARNING,
                "RSS feed parsing warning",
                context={
                    "error": str(error_msg),
                    "feed_url": feed_url
                }
            )
        
        # Parse episodes
        episodes = []
        failed_count = 0
        for entry in feed.entries:
            try:
                episode = parse_episode(entry)
                if episode:
                    episodes.append(episode)
            except Exception as e:
                failed_count += 1
                log_with_context(
                    logger,
                    logging.WARNING,
                    "Failed to parse episode",
                    context={
                        "error": str(e),
                        "entry_title": entry.get('title', 'Unknown')
                    }
                )
                continue
        
        if failed_count > 0:
            log_with_context(
                logger,
                logging.WARNING,
                "Some episodes failed to parse",
                context={
                    "failed_count": failed_count,
                    "success_count": len(episodes),
                    "total_entries": len(feed.entries)
                }
            )
        
        logger.info(f"Successfully parsed {len(episodes)} episodes")
        return episodes
        
    except Exception as e:
        logger.error(
            "Failed to parse RSS feed",
            exc_info=True,
            extra={"context": {"feed_url": feed_url, "error": str(e)}}
        )
        raise RuntimeError(f"Failed to parse RSS feed: {str(e)}") from e


def parse_episode(entry: Any) -> Optional[Episode]:
    """
    Parse a single RSS feed entry into an Episode object.
    
    Args:
        entry: feedparser entry object
        
    Returns:
        Episode object or None if parsing fails
    """
    try:
        # Extract episode ID from itunes:episode tag
        episode_id = None
        if hasattr(entry, 'itunes_episode'):
            episode_id = int(entry.itunes_episode)
        elif hasattr(entry, 'id'):
            # Try to extract from entry ID
            try:
                episode_id = int(entry.id)
            except (ValueError, TypeError):
                pass
        
        if episode_id is None:
            logger.warning(
                f"Episode missing ID, skipping: {entry.get('title', 'Unknown')}"
            )
            return None
        
        # Extract basic fields
        title = entry.get('title', '')
        description = entry.get('description', '') or entry.get('summary', '')
        
        # Parse publication date
        pub_date_str = entry.get('published', '')
        if pub_date_str:
            publication_date = date_parser.parse(pub_date_str)
        else:
            logger.warning(f"Episode {episode_id} missing publication date")
            publication_date = datetime.now()
        
        # Extract duration
        duration = "00:00:00"
        if hasattr(entry, 'itunes_duration'):
            duration = entry.itunes_duration
        
        # Extract enclosure (audio file) information
        url = ""
        file_size = 0
        if hasattr(entry, 'enclosures') and entry.enclosures:
            enclosure = entry.enclosures[0]
            url = enclosure.get('href', '') or enclosure.get('url', '')
            try:
                file_size = int(enclosure.get('length', 0))
            except (ValueError, TypeError):
                file_size = 0
        elif hasattr(entry, 'link'):
            url = entry.link
        
        # Extract guests (from custom fields or description)
        guests = extract_guests(entry)
        
        # Extract links (from custom fields or description)
        links = extract_links(entry)
        
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
        
    except Exception as e:
        logger.error(
            "Failed to parse episode entry",
            exc_info=True,
            extra={"context": {"error": str(e)}}
        )
        return None


def extract_guests(entry: Any) -> List[Guest]:
    """
    Extract guest information from RSS entry.
    
    Supports multiple guests per episode using aws:guest-name, aws:guest-title,
    and aws:guest-link custom namespace tags.
    
    Args:
        entry: feedparser entry object
        
    Returns:
        List of Guest objects
    """
    guests = []
    
    # Extract from aws:guest custom namespace (used in actual RSS feed)
    # The RSS feed uses: <aws:guest-name>, <aws:guest-title>, <aws:guest-link>
    # Feedparser stores these as dictionary keys with hyphens preserved
    
    # Check if we have multiple guests (stored as lists)
    guest_names = entry.get('aws_guest-name', [])
    guest_titles = entry.get('aws_guest-title', [])
    guest_links = entry.get('aws_guest-link', [])
    
    # Normalize to lists if single values
    if isinstance(guest_names, str):
        guest_names = [guest_names] if guest_names else []
    if isinstance(guest_titles, str):
        guest_titles = [guest_titles] if guest_titles else []
    if isinstance(guest_links, str):
        guest_links = [guest_links] if guest_links else []
    
    # Process each guest
    for i, name in enumerate(guest_names):
        name = name.strip()
        if not name:  # Skip empty or whitespace-only names
            continue
            
        # Get corresponding title and link (if available)
        title = guest_titles[i].strip() if i < len(guest_titles) else None
        linkedin_url = guest_links[i].strip() if i < len(guest_links) else None
        
        # Use None for empty strings
        title = title if title else None
        linkedin_url = linkedin_url if linkedin_url else None
        
        guests.append(Guest(
            name=name,
            title=title,
            linkedin_url=linkedin_url
        ))
    
    return guests


def extract_links(entry: Any) -> List[Link]:
    """
    Extract related links from RSS entry.
    
    Args:
        entry: feedparser entry object
        
    Returns:
        List of Link objects
    """
    links = []
    
    # Extract links from content:encoded
    if hasattr(entry, 'content') and entry.content:
        content = entry.content[0].value if entry.content else ""
        
        # Look for pattern: <a href="url">text</a> in list items
        # Pattern: <a href="url">text</a>
        pattern = r'<a href=["\']([^"\']+)["\']>([^<]+)</a>'
        matches = re.findall(pattern, content)
        
        for url, text in matches:
            # Skip LinkedIn profile links (those are guest links)
            if 'linkedin.com/in/' not in url:
                links.append(Link(text=text, url=url))
    
    return links
