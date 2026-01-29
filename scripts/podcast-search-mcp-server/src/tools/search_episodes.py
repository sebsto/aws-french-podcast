"""Combined search tool with automatic query routing."""

import json
import logging
import time
from typing import TYPE_CHECKING, Optional

from ..utils.logging import get_logger, log_with_context

if TYPE_CHECKING:
    from ..search.router import SearchRouter


logger = get_logger("SearchEpisodesTool")


async def search_episodes_impl(
    query: str,
    search_router: "SearchRouter",
    search_type: Optional[str] = None
) -> str:
    """
    Search podcast episodes using various criteria.
    
    This is a unified search interface that automatically routes queries to the
    appropriate search backend based on query patterns:
    - Episode ID patterns (e.g., "episode 341", "#341") → Episode ID search
    - Date patterns (e.g., "2024-01-01 to 2024-12-31") → Date range search
    - Guest indicators (e.g., "with John", "featuring Jane") → Guest search
    - Natural language queries → Semantic search
    
    Args:
        query: Search query (episode ID, date range, guest name, or natural language)
        search_router: Search Router instance
        search_type: Optional hint ("id", "date", "guest", "semantic") to override auto-detection
        
    Returns:
        JSON string with search results
    """
    start_time = time.time()
    
    try:
        log_with_context(
            logger,
            logging.INFO,
            "search_episodes tool invoked",
            context={"query": query, "search_type_hint": search_type}
        )
        
        # Route query to appropriate search backend
        result = await search_router.route_query(query, search_type)
        
        execution_time_ms = (time.time() - start_time) * 1000
        log_with_context(
            logger,
            logging.INFO,
            "search_episodes tool completed",
            context={
                "query": query,
                "status": result.get("status"),
                "result_count": result.get("count", 0)
            },
            execution_time_ms=execution_time_ms
        )
        
        return json.dumps(result)
        
    except Exception as e:
        execution_time_ms = (time.time() - start_time) * 1000
        logger.error(
            "search_episodes tool failed",
            exc_info=True,
            extra={
                "context": {
                    "query": query,
                    "error": str(e)
                },
                "execution_time_ms": execution_time_ms
            }
        )
        return json.dumps({
            "status": "error",
            "error_type": "ServerError",
            "message": f"Search failed: {str(e)}",
            "suggested_action": "Try rephrasing your query or check server logs"
        })
