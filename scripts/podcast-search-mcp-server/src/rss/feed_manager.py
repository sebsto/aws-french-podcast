"""RSS feed management with caching and search capabilities."""

import logging
import time
from datetime import date
from typing import List, Optional

from ..models.episode import Episode
from ..utils.logging import get_logger, log_with_context
from .parser import parse_feed


logger = get_logger("RSSFeedManager")


class RSSFeedManager:
    """
    Manages RSS feed fetching, parsing, caching, and searching.
    
    Implements in-memory caching with automatic refresh based on TTL.
    Provides search methods for episode ID, date range, and guest name.
    Includes exponential backoff retry logic for network failures.
    """
    
    def __init__(self, feed_url: str, cache_ttl: int):
        """
        Initialize RSS Feed Manager.
        
        Args:
            feed_url: URL of the RSS feed
            cache_ttl: Cache time-to-live in seconds
        """
        self.feed_url = feed_url
        self.cache_ttl = cache_ttl
        self._cached_episodes: List[Episode] = []
        self._cache_timestamp: Optional[float] = None
        self._max_retries = 3
        self._base_backoff = 1.0  # seconds
    
    def fetch_and_parse(self) -> List[Episode]:
        """
        Fetch RSS feed and parse into Episode objects.
        
        Implements exponential backoff retry logic (3 attempts).
        
        Returns:
            List of Episode objects
            
        Raises:
            RuntimeError: If all retry attempts fail
        """
        last_error = None
        
        for attempt in range(self._max_retries):
            try:
                log_with_context(
                    logger,
                    logging.INFO,
                    "Fetching RSS feed",
                    context={
                        "feed_url": self.feed_url,
                        "attempt": attempt + 1,
                        "max_retries": self._max_retries
                    }
                )
                
                # Parse RSS feed
                episodes = parse_feed(self.feed_url)
                
                log_with_context(
                    logger,
                    logging.INFO,
                    "Successfully parsed RSS feed",
                    context={"episode_count": len(episodes)}
                )
                
                return episodes
                
            except Exception as e:
                last_error = e
                log_with_context(
                    logger,
                    logging.ERROR,
                    "RSS feed fetch failed",
                    context={
                        "attempt": attempt + 1,
                        "max_retries": self._max_retries,
                        "error": str(e)
                    }
                )
                
                # Exponential backoff before retry
                if attempt < self._max_retries - 1:
                    backoff_time = self._base_backoff * (2 ** attempt)
                    logger.info(f"Retrying in {backoff_time} seconds...")
                    time.sleep(backoff_time)
        
        # All retries failed
        logger.error(
            "Failed to fetch RSS feed after all retry attempts",
            exc_info=True,
            extra={
                "context": {
                    "max_retries": self._max_retries,
                    "last_error": str(last_error)
                }
            }
        )
        raise RuntimeError(
            f"Failed to fetch RSS feed after {self._max_retries} attempts. "
            f"Last error: {str(last_error)}"
        )
    
    def get_cached_episodes(self) -> List[Episode]:
        """
        Get episodes from cache, refresh if stale.
        
        Automatically refreshes cache if:
        - Cache is empty
        - Cache age exceeds TTL
        
        Returns:
            List of cached Episode objects
            
        Raises:
            RuntimeError: If cache refresh fails and no cached data available
        """
        current_time = time.time()
        
        # Check if cache needs refresh
        needs_refresh = (
            self._cache_timestamp is None or
            not self._cached_episodes or
            (current_time - self._cache_timestamp) > self.cache_ttl
        )
        
        if needs_refresh:
            try:
                cache_age = (
                    current_time - self._cache_timestamp
                    if self._cache_timestamp
                    else None
                )
                log_with_context(
                    logger,
                    logging.INFO,
                    "Cache is stale, refreshing",
                    context={
                        "cache_age_seconds": cache_age,
                        "cache_ttl_seconds": self.cache_ttl
                    }
                )
                self._cached_episodes = self.fetch_and_parse()
                self._cache_timestamp = current_time
                log_with_context(
                    logger,
                    logging.INFO,
                    "Cache refreshed successfully",
                    context={"episode_count": len(self._cached_episodes)}
                )
            except Exception as e:
                # If refresh fails but we have cached data, use stale cache
                if self._cached_episodes:
                    logger.warning(
                        "Cache refresh failed, using stale cache",
                        extra={"context": {"error": str(e)}}
                    )
                else:
                    # No cached data and refresh failed
                    logger.error(
                        "Failed to refresh cache and no cached data available",
                        exc_info=True,
                        extra={"context": {"error": str(e)}}
                    )
                    raise RuntimeError(
                        f"Failed to refresh cache and no cached data available: {str(e)}"
                    ) from e
        
        return self._cached_episodes
    
    def search_by_id(self, episode_id: int) -> Optional[Episode]:
        """
        Find episode by ID.
        
        Args:
            episode_id: Episode number
            
        Returns:
            Episode object or None if not found
        """
        episodes = self.get_cached_episodes()
        
        for episode in episodes:
            if episode.id == episode_id:
                return episode
        
        return None
    
    def search_by_date_range(
        self,
        start_date: date,
        end_date: date
    ) -> List[Episode]:
        """
        Find episodes within date range.
        
        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            
        Returns:
            List of episodes sorted by date descending (newest first)
        """
        episodes = self.get_cached_episodes()
        
        # Filter episodes by date range
        matching_episodes = [
            ep for ep in episodes
            if start_date <= ep.publication_date.date() <= end_date
        ]
        
        # Sort by publication date descending
        matching_episodes.sort(key=lambda ep: ep.publication_date, reverse=True)
        
        return matching_episodes
    
    def search_by_guest(self, guest_name: str) -> List[Episode]:
        """
        Find episodes featuring guest (case-insensitive partial match).
        
        Args:
            guest_name: Guest name or partial name
            
        Returns:
            List of episodes sorted by date descending (newest first)
        """
        episodes = self.get_cached_episodes()
        guest_name_lower = guest_name.lower()
        
        # Filter episodes by guest name (case-insensitive partial match)
        matching_episodes = []
        for episode in episodes:
            for guest in episode.guests:
                if guest_name_lower in guest.name.lower():
                    matching_episodes.append(episode)
                    break  # Don't add same episode multiple times
        
        # Sort by publication date descending
        matching_episodes.sort(key=lambda ep: ep.publication_date, reverse=True)
        
        return matching_episodes
