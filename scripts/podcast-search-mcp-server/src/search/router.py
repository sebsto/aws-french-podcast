"""Query routing and pattern detection for search."""

import logging
import re
import time
from enum import Enum
from datetime import date, datetime, timedelta
from typing import Dict, Any, Optional

from ..rss.feed_manager import RSSFeedManager
from ..utils.logging import get_logger, log_with_context
from .semantic import SemanticSearchEngine


logger = get_logger("SearchRouter")


class QueryType(Enum):
    """Types of search queries that can be detected."""
    
    EPISODE_ID = "episode_id"      # Pattern: "episode 341", "#341"
    DATE_RANGE = "date_range"      # Pattern: "2024-01-01 to 2024-12-31"
    GUEST_NAME = "guest_name"      # Pattern: "with [name]", "featuring [name]"
    SEMANTIC = "semantic"          # Default: natural language


class SearchRouter:
    """
    Routes search queries to appropriate search backend.
    
    Analyzes query patterns to determine whether to use:
    - Episode ID search (deterministic)
    - Date range search (deterministic)
    - Guest name search (deterministic)
    - Semantic search (Bedrock Knowledge Base)
    
    Prioritizes deterministic searches over semantic searches when
    multiple patterns are detected.
    """
    
    def __init__(
        self,
        rss_manager: RSSFeedManager,
        semantic_engine: Optional[SemanticSearchEngine]
    ):
        """
        Initialize Search Router.
        
        Args:
            rss_manager: RSS Feed Manager instance
            semantic_engine: Semantic Search Engine instance (optional)
        """
        self.rss_manager = rss_manager
        self.semantic_engine = semantic_engine
    
    def _detect_query_type(self, query: str) -> QueryType:
        """
        Detect query type from patterns.
        
        Analyzes the query string to identify patterns that indicate
        specific search types. Prioritizes deterministic searches.
        
        Args:
            query: User's search query
            
        Returns:
            QueryType enum value
        """
        query_lower = query.lower()
        
        # Pattern 1: Episode ID patterns
        # Matches: "episode 341", "ep 341", "#341", "episode #341"
        episode_patterns = [
            r'\bepisode\s*#?\s*(\d+)',
            r'\bep\s*#?\s*(\d+)',
            r'#(\d+)',
            r'\bepisode\s+(\d+)',
        ]
        
        for pattern in episode_patterns:
            if re.search(pattern, query_lower):
                return QueryType.EPISODE_ID
        
        # Pattern 2: Date range patterns
        # Matches: "2024-01-01 to 2024-12-31", "from 2024-01-01 to 2024-12-31"
        # Also matches: "January 2024", "2024", "in 2024"
        date_patterns = [
            r'\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}',
            r'from\s+\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}',
            r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}',
            r'\bin\s+\d{4}',
            r'\d{4}-\d{2}-\d{2}',
        ]
        
        for pattern in date_patterns:
            if re.search(pattern, query_lower):
                return QueryType.DATE_RANGE
        
        # Pattern 3: Guest name indicators
        # Matches: "with [name]", "featuring [name]", "guest [name]"
        guest_patterns = [
            r'\bwith\s+\w+',
            r'\bfeaturing\s+\w+',
            r'\bguest\s+\w+',
            r'\bby\s+\w+',
        ]
        
        for pattern in guest_patterns:
            if re.search(pattern, query_lower):
                return QueryType.GUEST_NAME
        
        # Default: Semantic search for natural language queries
        return QueryType.SEMANTIC
    
    async def route_query(
        self,
        query: str,
        search_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Route query to appropriate search engine.
        
        Args:
            query: User's search query
            search_type: Optional hint about search type ("id", "date", "guest", "semantic")
            
        Returns:
            Dictionary with search results in consistent format:
            {
                "status": "success" or "error",
                "count": number of results,
                "results": list of episode dictionaries,
                "search_type": type of search performed,
                "message": optional informative message
            }
        """
        start_time = time.time()
        
        # Determine query type
        if search_type:
            # Use provided hint
            type_mapping = {
                "id": QueryType.EPISODE_ID,
                "date": QueryType.DATE_RANGE,
                "guest": QueryType.GUEST_NAME,
                "semantic": QueryType.SEMANTIC
            }
            detected_type = type_mapping.get(search_type.lower(), QueryType.SEMANTIC)
        else:
            # Auto-detect from query
            detected_type = self._detect_query_type(query)
        
        log_with_context(
            logger,
            logging.INFO,
            "Routing query to search backend",
            context={
                "query": query,
                "detected_type": detected_type.value,
                "search_type_hint": search_type
            }
        )
        
        try:
            # Route to appropriate search backend
            if detected_type == QueryType.EPISODE_ID:
                result = await self._search_by_episode_id(query)
            
            elif detected_type == QueryType.DATE_RANGE:
                result = await self._search_by_date_range(query)
            
            elif detected_type == QueryType.GUEST_NAME:
                result = await self._search_by_guest(query)
            
            else:  # QueryType.SEMANTIC
                result = await self._search_semantic(query)
            
            execution_time_ms = (time.time() - start_time) * 1000
            log_with_context(
                logger,
                logging.INFO,
                "Query routing completed",
                context={
                    "query": query,
                    "search_type": detected_type.value,
                    "status": result.get("status"),
                    "result_count": result.get("count", 0)
                },
                execution_time_ms=execution_time_ms
            )
            
            return result
        
        except Exception as e:
            logger.error(
                "Search routing failed",
                exc_info=True,
                extra={"context": {"query": query, "error": str(e)}}
            )
            return {
                "status": "error",
                "error_type": "SearchError",
                "message": f"Search failed: {str(e)}",
                "suggested_action": "Try rephrasing your query or check server logs"
            }
    
    async def _search_by_episode_id(self, query: str) -> Dict[str, Any]:
        """
        Extract episode ID from query and search.
        
        Args:
            query: Query containing episode ID
            
        Returns:
            Search result dictionary
        """
        # Extract episode ID from query
        patterns = [
            r'\bepisode\s*#?\s*(\d+)',
            r'\bep\s*#?\s*(\d+)',
            r'#(\d+)',
        ]
        
        episode_id = None
        for pattern in patterns:
            match = re.search(pattern, query.lower())
            if match:
                episode_id = int(match.group(1))
                break
        
        if episode_id is None:
            return {
                "status": "error",
                "error_type": "ValidationError",
                "message": "Could not extract episode ID from query",
                "suggested_action": "Use format like 'episode 341' or '#341'"
            }
        
        # Search for episode
        episode = self.rss_manager.search_by_id(episode_id)
        
        if episode:
            return {
                "status": "success",
                "count": 1,
                "results": [episode.to_dict()],
                "search_type": "episode_id"
            }
        else:
            return {
                "status": "error",
                "error_type": "NotFoundError",
                "message": f"Episode {episode_id} not found",
                "suggested_action": "Check the episode number and try again"
            }
    
    async def _search_by_date_range(self, query: str) -> Dict[str, Any]:
        """
        Extract date range from query and search.
        
        Args:
            query: Query containing date range
            
        Returns:
            Search result dictionary
        """
        query_lower = query.lower()
        
        # Try to extract explicit date range: "2024-01-01 to 2024-12-31"
        range_pattern = r'(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})'
        match = re.search(range_pattern, query_lower)
        
        if match:
            try:
                start_date = datetime.fromisoformat(match.group(1)).date()
                end_date = datetime.fromisoformat(match.group(2)).date()
            except ValueError as e:
                return {
                    "status": "error",
                    "error_type": "ValidationError",
                    "message": f"Invalid date format: {str(e)}",
                    "suggested_action": "Use ISO 8601 format (YYYY-MM-DD)"
                }
        else:
            # Try to extract month/year: "January 2024"
            month_pattern = r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})'
            match = re.search(month_pattern, query_lower)
            
            if match:
                month_name = match.group(1)
                year = int(match.group(2))
                
                # Convert month name to number
                month_map = {
                    'january': 1, 'february': 2, 'march': 3, 'april': 4,
                    'may': 5, 'june': 6, 'july': 7, 'august': 8,
                    'september': 9, 'october': 10, 'november': 11, 'december': 12
                }
                month = month_map[month_name]
                
                # Create date range for the entire month
                start_date = date(year, month, 1)
                
                # Calculate last day of month
                if month == 12:
                    end_date = date(year + 1, 1, 1) - timedelta(days=1)
                else:
                    end_date = date(year, month + 1, 1) - timedelta(days=1)
            else:
                # Try to extract single date: "2024-01-01"
                single_date_pattern = r'\d{4}-\d{2}-\d{2}'
                match = re.search(single_date_pattern, query_lower)
                
                if match:
                    try:
                        single_date = datetime.fromisoformat(match.group(0)).date()
                        start_date = single_date
                        end_date = single_date
                    except ValueError as e:
                        return {
                            "status": "error",
                            "error_type": "ValidationError",
                            "message": f"Invalid date format: {str(e)}",
                            "suggested_action": "Use ISO 8601 format (YYYY-MM-DD)"
                        }
                else:
                    return {
                        "status": "error",
                        "error_type": "ValidationError",
                        "message": "Could not extract date range from query",
                        "suggested_action": "Use format like '2024-01-01 to 2024-12-31' or 'January 2024'"
                    }
        
        # Validate date range
        if start_date > end_date:
            return {
                "status": "error",
                "error_type": "ValidationError",
                "message": "Start date must be before or equal to end date",
                "suggested_action": "Swap the dates or provide a valid range"
            }
        
        # Search for episodes
        episodes = self.rss_manager.search_by_date_range(start_date, end_date)
        
        return {
            "status": "success",
            "count": len(episodes),
            "results": [ep.to_dict() for ep in episodes],
            "search_type": "date_range",
            "message": f"Found {len(episodes)} episode(s) between {start_date} and {end_date}"
        }
    
    async def _search_by_guest(self, query: str) -> Dict[str, Any]:
        """
        Extract guest name from query and search.
        
        Args:
            query: Query containing guest name
            
        Returns:
            Search result dictionary
        """
        query_lower = query.lower()
        
        # Try to extract guest name after indicators
        patterns = [
            r'\bwith\s+(.+?)(?:\s+on|\s+in|\s+about|$)',
            r'\bfeaturing\s+(.+?)(?:\s+on|\s+in|\s+about|$)',
            r'\bguest\s+(.+?)(?:\s+on|\s+in|\s+about|$)',
            r'\bby\s+(.+?)(?:\s+on|\s+in|\s+about|$)',
        ]
        
        guest_name = None
        for pattern in patterns:
            match = re.search(pattern, query_lower)
            if match:
                guest_name = match.group(1).strip()
                break
        
        if not guest_name:
            # If no indicator found, use the entire query as guest name
            guest_name = query.strip()
        
        # Search for episodes
        episodes = self.rss_manager.search_by_guest(guest_name)
        
        return {
            "status": "success",
            "count": len(episodes),
            "results": [ep.to_dict() for ep in episodes],
            "search_type": "guest_name",
            "message": f"Found {len(episodes)} episode(s) featuring '{guest_name}'" if episodes else f"No episodes found featuring '{guest_name}'"
        }
    
    async def _search_semantic(self, query: str) -> Dict[str, Any]:
        """
        Perform semantic search using Bedrock Knowledge Base.
        
        Args:
            query: Natural language query
            
        Returns:
            Search result dictionary
        """
        if not self.semantic_engine:
            return {
                "status": "error",
                "error_type": "ConfigurationError",
                "message": "Semantic search is not available",
                "suggested_action": "Configure BEDROCK_KB_ID environment variable"
            }
        
        try:
            # Perform semantic search
            results = await self.semantic_engine.search(query)
            
            # Convert SemanticResult objects to dictionaries
            result_dicts = []
            for result in results:
                result_dict = result.to_dict()
                # Add relevance_score to match semantic search format
                result_dicts.append(result_dict)
            
            return {
                "status": "success",
                "count": len(results),
                "results": result_dicts,
                "search_type": "semantic",
                "message": f"Found {len(results)} relevant episode(s)"
            }
        
        except Exception as e:
            return {
                "status": "error",
                "error_type": "BedrockError",
                "message": f"Semantic search failed: {str(e)}",
                "suggested_action": "Check AWS credentials and Knowledge Base configuration"
            }
