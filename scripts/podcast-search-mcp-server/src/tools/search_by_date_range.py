"""Tool for searching episodes by date range."""

import json
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..rss.feed_manager import RSSFeedManager


async def search_by_date_range_impl(
    start_date: str,
    end_date: str,
    rss_manager: "RSSFeedManager"
) -> str:
    """
    Find episodes published within a date range.
    
    Args:
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)
        rss_manager: RSS Feed Manager instance
        
    Returns:
        JSON string with matching episodes sorted by date (descending)
    """
    try:
        # Parse dates
        start = datetime.fromisoformat(start_date).date()
        end = datetime.fromisoformat(end_date).date()
        
        # Validate date range
        if start > end:
            return json.dumps({
                "status": "error",
                "error_type": "ValidationError",
                "message": "Start date must be before or equal to end date",
                "suggested_action": "Swap the dates or provide a valid range"
            })
        
        # Search for episodes
        episodes = rss_manager.search_by_date_range(start, end)
        
        return json.dumps({
            "status": "success",
            "count": len(episodes),
            "results": [ep.to_dict() for ep in episodes],
            "message": f"Found {len(episodes)} episode(s) between {start_date} and {end_date}"
        })
        
    except ValueError as e:
        return json.dumps({
            "status": "error",
            "error_type": "ValidationError",
            "message": f"Invalid date format: {str(e)}",
            "suggested_action": "Provide dates in ISO 8601 format (YYYY-MM-DD). Example: 2024-01-15"
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "error_type": "ServerError",
            "message": f"Failed to search by date range: {str(e)}",
            "suggested_action": "Check server logs for details"
        })
