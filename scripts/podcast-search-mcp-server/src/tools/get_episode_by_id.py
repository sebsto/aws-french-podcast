"""Tool for retrieving episode by ID."""

import json
import logging
import time
from typing import TYPE_CHECKING

from ..utils.logging import get_logger, log_with_context

if TYPE_CHECKING:
    from ..rss.feed_manager import RSSFeedManager


logger = get_logger("GetEpisodeByIdTool")


async def get_episode_by_id_impl(episode_id: int, rss_manager: "RSSFeedManager") -> str:
    """
    Get detailed information about a specific episode by ID.
    
    Args:
        episode_id: Episode number (e.g., 341)
        rss_manager: RSS Feed Manager instance
        
    Returns:
        JSON string with episode details or error message
    """
    start_time = time.time()
    
    # Validate episode_id
    if not isinstance(episode_id, int) or episode_id <= 0:
        logger.warning(
            f"Invalid episode ID provided: {episode_id}",
            extra={"context": {"episode_id": episode_id}}
        )
        return json.dumps({
            "status": "error",
            "error_type": "ValidationError",
            "message": f"Invalid episode ID: {episode_id}. Must be a positive integer.",
            "suggested_action": "Provide a valid episode number (e.g., 341)"
        })
    
    try:
        log_with_context(
            logger,
            logging.INFO,
            "get_episode_by_id tool invoked",
            context={"episode_id": episode_id}
        )
        
        # Search for episode
        episode = rss_manager.search_by_id(episode_id)
        
        execution_time_ms = (time.time() - start_time) * 1000
        
        if episode:
            log_with_context(
                logger,
                logging.INFO,
                "get_episode_by_id tool completed successfully",
                context={"episode_id": episode_id, "found": True},
                execution_time_ms=execution_time_ms
            )
            return json.dumps({
                "status": "success",
                "count": 1,
                "results": [episode.to_dict()]
            })
        else:
            log_with_context(
                logger,
                logging.INFO,
                "Episode not found",
                context={"episode_id": episode_id, "found": False},
                execution_time_ms=execution_time_ms
            )
            return json.dumps({
                "status": "error",
                "error_type": "NotFoundError",
                "message": f"Episode {episode_id} not found",
                "suggested_action": "Check the episode number and try again"
            })
    except Exception as e:
        execution_time_ms = (time.time() - start_time) * 1000
        logger.error(
            "get_episode_by_id tool failed",
            exc_info=True,
            extra={
                "context": {"episode_id": episode_id, "error": str(e)},
                "execution_time_ms": execution_time_ms
            }
        )
        return json.dumps({
            "status": "error",
            "error_type": "ServerError",
            "message": f"Failed to search for episode: {str(e)}",
            "suggested_action": "Check server logs for details"
        })
